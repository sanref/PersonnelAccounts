import crypto from "crypto";
import * as webpush from "web-push";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  monthlyItems,
  notificationDeliveries,
  notificationSettings,
  pushSubscriptions,
  services,
} from "@/db";
import { formatDateAR, formatMoney, shiftPeriod } from "@/lib/format";

export interface DueAlertItem {
  id: number;
  period: string;
  concept: string;
  personName: string;
  dueDate: string;
  amount: string | null;
  diffDays: number; // <0 vencido, 0 vence hoy, >0 faltan N días
  urgency: "OVERDUE" | "DUE_TODAY" | "UPCOMING";
}

export interface PublicNotificationSettings {
  enabled: boolean;
  notifyTime: string;
  timezone: string;
  daysBefore: number;
  notifyOnDueDay: boolean;
  notifyOverdue: boolean;
  vapidPublicKey: string;
  cronSecret: string;
}

export function getNowInTimezone(timezone: string): {
  todayYMD: string;
  hhmm: string;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const rawHour = get("hour");
  const hour = rawHour === "24" ? "00" : rawHour.padStart(2, "0");
  const minute = get("minute").padStart(2, "0");

  return {
    todayYMD: `${year}-${month}-${day}`,
    hhmm: `${hour}:${minute}`,
  };
}

export function diffDaysYMD(fromYMD: string, toYMD: string): number {
  const [fy, fm, fd] = fromYMD.split("-").map(Number);
  const [ty, tm, td] = toYMD.split("-").map(Number);
  const fromUTC = Date.UTC(fy, fm - 1, fd);
  const toUTC = Date.UTC(ty, tm - 1, td);
  return Math.round((toUTC - fromUTC) / 86_400_000);
}

function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function clampDayForPeriod(period: string, day: number): string {
  const [y, m] = period.split("-").map(Number);
  const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const safeDay = Math.max(1, Math.min(day, maxDay));
  return `${period}-${String(safeDay).padStart(2, "0")}`;
}

export async function getOrCreateNotificationSettings() {
  let row = await db.query.notificationSettings.findFirst();

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();

  if (!row) {
    const generated =
      envPub && envPriv ? { publicKey: envPub, privateKey: envPriv } : webpush.generateVAPIDKeys();
    const cronSecret = crypto.randomBytes(18).toString("base64url");

    const [created] = await db
      .insert(notificationSettings)
      .values({
        enabled: true,
        notifyTime: "09:00",
        timezone: "America/Argentina/Buenos_Aires",
        daysBefore: 3,
        notifyOnDueDay: true,
        notifyOverdue: false,
        vapidPublicKey: generated.publicKey,
        vapidPrivateKey: generated.privateKey,
        cronSecret,
      })
      .returning();

    return created;
  }

  let needsUpdate = false;
  let vapidPublicKey = envPub || row.vapidPublicKey;
  let vapidPrivateKey = envPriv || row.vapidPrivateKey;
  let cronSecret = row.cronSecret;

  if (!vapidPublicKey || !vapidPrivateKey) {
    const generated = webpush.generateVAPIDKeys();
    vapidPublicKey = generated.publicKey;
    vapidPrivateKey = generated.privateKey;
    needsUpdate = true;
  }

  if (!cronSecret) {
    cronSecret = crypto.randomBytes(18).toString("base64url");
    needsUpdate = true;
  }

  if (needsUpdate) {
    const [updated] = await db
      .update(notificationSettings)
      .set({
        vapidPublicKey,
        vapidPrivateKey,
        cronSecret,
        updatedAt: new Date(),
      })
      .where(eq(notificationSettings.id, row.id))
      .returning();
    return updated;
  }

  return row;
}

/**
 * Garantiza que los servicios activos tengan creadas sus filas mensuales en el período actual
 * (y en el mes siguiente si el horizonte de anticipación cruza de mes), para que las fechas
 * de vencimiento existan sin depender de que el usuario haya entrado antes a /pagos.
 */
export async function ensurePeriodsInitialized(todayYMD: string, daysBefore: number) {
  const currentPeriod = todayYMD.slice(0, 7);
  const horizonPeriod = addDaysYMD(todayYMD, Math.max(daysBefore, 7)).slice(0, 7);
  const periods =
    horizonPeriod !== currentPeriod ? [currentPeriod, horizonPeriod] : [currentPeriod];

  const activeServices = await db.query.services.findMany({
    where: eq(services.isActive, true),
  });
  if (activeServices.length === 0) return;

  for (const period of periods) {
    const existing = await db.query.monthlyItems.findMany({
      where: eq(monthlyItems.period, period),
    });
    const existingSrvIds = new Set(existing.map((i) => i.serviceId).filter(Boolean));
    const toCreate = activeServices.filter((s) => !existingSrvIds.has(s.id));

    if (toCreate.length > 0) {
      await db.insert(monthlyItems).values(
        toCreate.map((s) => ({
          period,
          billedPeriod: s.paysInArrears ? shiftPeriod(period, -1) : period,
          personId: s.personId,
          serviceId: s.id,
          kind: "SERVICE",
          concept: s.name,
          dueDate: clampDayForPeriod(period, s.defaultDueDay ?? 15),
          amount: s.defaultAmount ?? null,
          status: "PENDING",
          notes: s.notes,
          sortOrder: s.sortOrder,
        }))
      );
    }
  }
}

export async function getPublicNotificationState() {
  const settings = await getOrCreateNotificationSettings();
  const { todayYMD, hhmm } = getNowInTimezone(settings.timezone);

  await ensurePeriodsInitialized(todayYMD, settings.daysBefore);

  const [pendingItems, subs] = await Promise.all([
    db.query.monthlyItems.findMany({
      where: and(eq(monthlyItems.status, "PENDING"), isNotNull(monthlyItems.dueDate)),
      orderBy: [asc(monthlyItems.dueDate), asc(monthlyItems.id)],
      with: { person: true },
    }),
    db.query.pushSubscriptions.findMany({
      orderBy: [asc(pushSubscriptions.id)],
    }),
  ]);

  const lookaheadDays = Math.max(settings.daysBefore, 7);
  const alerts: DueAlertItem[] = [];

  for (const item of pendingItems) {
    if (!item.dueDate) continue;
    const diff = diffDaysYMD(todayYMD, item.dueDate);
    if (diff > lookaheadDays) continue;

    alerts.push({
      id: item.id,
      period: item.period,
      concept: item.concept,
      personName: item.person.name,
      dueDate: item.dueDate,
      amount: item.amount,
      diffDays: diff,
      urgency: diff < 0 ? "OVERDUE" : diff === 0 ? "DUE_TODAY" : "UPCOMING",
    });
  }

  return {
    settings: {
      enabled: settings.enabled,
      notifyTime: settings.notifyTime,
      timezone: settings.timezone,
      daysBefore: settings.daysBefore,
      notifyOnDueDay: settings.notifyOnDueDay,
      notifyOverdue: settings.notifyOverdue,
      vapidPublicKey: settings.vapidPublicKey!,
      cronSecret: settings.cronSecret!,
    } satisfies PublicNotificationSettings,
    devices: subs.map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      deviceLabel: s.deviceLabel ?? "Dispositivo",
      createdAt: s.createdAt.toISOString(),
    })),
    alerts,
    serverDateYMD: todayYMD,
    serverTimeHHMM: hhmm,
  };
}

async function sendWebPushToAll(
  vapidPublicKey: string,
  vapidPrivateKey: string,
  payload: { title: string; body: string; url: string; tag: string }
) {
  const subs = await db.query.pushSubscriptions.findMany();
  if (subs.length === 0) {
    return { sent: 0, failed: 0, totalDevices: 0 };
  }

  webpush.setVapidDetails(
    "mailto:notificaciones@multicuentas.app",
    vapidPublicKey,
    vapidPrivateKey
  );

  let sent = 0;
  let failed = 0;
  const staleIds: number[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, staleIds));
  }

  return { sent, failed, totalDevices: subs.length };
}

function buildNotificationPayload(
  candidates: Array<{
    concept: string;
    personName: string;
    dueDate: string;
    amount: string | null;
    diffDays: number;
    period: string;
  }>,
  todayYMD: string
) {
  if (candidates.length === 1) {
    const c = candidates[0];
    const prefix =
      c.diffDays === 0
        ? "⏰ Vence hoy"
        : c.diffDays < 0
        ? "⚠️ Servicio vencido"
        : c.diffDays === 1
        ? "📅 Vence mañana"
        : `📅 Vence en ${c.diffDays} días`;

    const amountText =
      c.amount !== null && c.amount !== ""
        ? formatMoney(c.amount, "ARS")
        : "Importe pendiente";

    return {
      title: `${prefix}: ${c.concept} (${c.personName})`,
      body: `${amountText} · Vencimiento ${formatDateAR(c.dueDate)}`,
      url: `/pagos?period=${c.period}`,
      tag: `mc-due-${todayYMD}-${c.concept}`,
    };
  }

  const dueToday = candidates.filter((c) => c.diffDays === 0);
  const upcoming = candidates.filter((c) => c.diffDays > 0);
  const overdue = candidates.filter((c) => c.diffDays < 0);

  const parts: string[] = [];
  if (dueToday.length > 0) {
    parts.push(
      `Hoy: ${dueToday.map((c) => `${c.concept} (${c.personName})`).join(", ")}`
    );
  }
  if (upcoming.length > 0) {
    parts.push(
      `Próximos: ${upcoming
        .map((c) => `${c.concept} (${formatDateAR(c.dueDate).slice(0, 5)})`)
        .join(", ")}`
    );
  }
  if (overdue.length > 0) {
    parts.push(
      `Vencidos: ${overdue.map((c) => `${c.concept} (${c.personName})`).join(", ")}`
    );
  }

  return {
    title: `🔔 ${candidates.length} servicios pendientes de pago`,
    body: parts.join(" · "),
    url: "/pagos",
    tag: `mc-due-batch-${todayYMD}`,
  };
}

export async function dispatchDueNotifications(options?: { force?: boolean }) {
  const settings = await getOrCreateNotificationSettings();
  const { todayYMD, hhmm } = getNowInTimezone(settings.timezone);

  if (!options?.force) {
    if (!settings.enabled) {
      return {
        ok: true,
        skipped: "disabled",
        todayYMD,
        hhmm,
        notifyTime: settings.notifyTime,
      };
    }

    if (hhmm < settings.notifyTime) {
      return {
        ok: true,
        skipped: "before_notify_time",
        todayYMD,
        hhmm,
        notifyTime: settings.notifyTime,
      };
    }
  }

  await ensurePeriodsInitialized(todayYMD, settings.daysBefore);

  await db
    .update(notificationSettings)
    .set({ lastCheckedAt: new Date() })
    .where(eq(notificationSettings.id, settings.id));

  const pendingItems = await db.query.monthlyItems.findMany({
    where: and(eq(monthlyItems.status, "PENDING"), isNotNull(monthlyItems.dueDate)),
    orderBy: [asc(monthlyItems.dueDate), asc(monthlyItems.id)],
    with: { person: true },
  });

  if (pendingItems.length === 0) {
    return { ok: true, matched: 0, sent: 0, todayYMD, hhmm };
  }

  const pendingIds = pendingItems.map((i) => i.id);
  const existingDeliveries = await db.query.notificationDeliveries.findMany({
    where: inArray(notificationDeliveries.monthlyItemId, pendingIds),
  });

  const deliveredTodaySet = new Set(
    existingDeliveries
      .filter((d) => d.triggerDate === todayYMD)
      .map((d) => d.monthlyItemId)
  );
  const everDeliveredBeforeSet = new Set(
    existingDeliveries
      .filter((d) => d.reason === "BEFORE")
      .map((d) => d.monthlyItemId)
  );

  const candidates: Array<{
    id: number;
    concept: string;
    personName: string;
    dueDate: string;
    amount: string | null;
    diffDays: number;
    period: string;
    reason: "BEFORE" | "DUE_TODAY" | "OVERDUE";
  }> = [];

  for (const item of pendingItems) {
    if (!item.dueDate) continue;
    if (!options?.force && deliveredTodaySet.has(item.id)) continue;

    const diff = diffDaysYMD(todayYMD, item.dueDate);

    if (diff === 0 && settings.notifyOnDueDay) {
      candidates.push({
        id: item.id,
        concept: item.concept,
        personName: item.person.name,
        dueDate: item.dueDate,
        amount: item.amount,
        diffDays: diff,
        period: item.period,
        reason: "DUE_TODAY",
      });
    } else if (diff > 0 && settings.daysBefore > 0 && diff <= settings.daysBefore) {
      // Avisa exactamente cuando faltan `daysBefore` días, o la primera vez que entra en esa ventana si aún no se avisó
      if (options?.force || diff === settings.daysBefore || !everDeliveredBeforeSet.has(item.id)) {
        candidates.push({
          id: item.id,
          concept: item.concept,
          personName: item.person.name,
          dueDate: item.dueDate,
          amount: item.amount,
          diffDays: diff,
          period: item.period,
          reason: "BEFORE",
        });
      }
    } else if (diff < 0 && (settings.notifyOverdue || options?.force)) {
      candidates.push({
        id: item.id,
        concept: item.concept,
        personName: item.person.name,
        dueDate: item.dueDate,
        amount: item.amount,
        diffDays: diff,
        period: item.period,
        reason: "OVERDUE",
      });
    }
  }

  if (candidates.length === 0) {
    return { ok: true, matched: 0, sent: 0, todayYMD, hhmm };
  }

  const payload = buildNotificationPayload(candidates, todayYMD);
  const pushResult = await sendWebPushToAll(
    settings.vapidPublicKey!,
    settings.vapidPrivateKey!,
    payload
  );

  if (pushResult.sent > 0 && !options?.force) {
    await db
      .insert(notificationDeliveries)
      .values(
        candidates.map((c) => ({
          monthlyItemId: c.id,
          triggerDate: todayYMD,
          reason: c.reason,
        }))
      )
      .onConflictDoNothing();
  }

  return {
    ok: true,
    matched: candidates.length,
    ...pushResult,
    todayYMD,
    hhmm,
  };
}

export async function sendTestPushNotification() {
  const settings = await getOrCreateNotificationSettings();
  const payload = {
    title: "🔔 Notificaciones activas · MultiCuentas",
    body: `Prueba exitosa. Te avisaremos a las ${settings.notifyTime} hs según los vencimientos cargados.`,
    url: "/pagos",
    tag: `mc-test-${Date.now()}`,
  };

  return sendWebPushToAll(
    settings.vapidPublicKey!,
    settings.vapidPrivateKey!,
    payload
  );
}
