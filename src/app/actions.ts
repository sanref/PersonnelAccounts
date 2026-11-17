"use server";

import crypto from "crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  db,
  people,
  accounts,
  transactions,
  services,
  monthlyItems,
  notificationDeliveries,
  notificationSettings,
  pushSubscriptions,
} from "@/db";
import {
  ADMIN_COOKIE,
  VIEWER_PIN_COOKIE_PREFIX,
  requireAdmin,
  signAdminToken,
  signPinToken,
} from "@/lib/auth";
import { formatMoney, formatPeriodLabel, shiftPeriod, todayISO } from "@/lib/format";
import { isValidFrequency, serviceAppliesToPeriod } from "@/lib/service-schedule";
import {
  dispatchDueNotifications,
  getOrCreateNotificationSettings,
  sendTestPushNotification,
} from "@/lib/notifications";

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

// ==========================================
// AUTENTICACIÓN ADMIN & PIN FAMILIAR
// ==========================================

export async function loginAdminAction(
  _prevState: { error?: string } | null,
  formData: FormData
) {
  const mode = String(formData.get("mode") ?? "admin");
  const password = String(formData.get("password") ?? "").trim();
  const nextPath = String(formData.get("next") ?? "/").trim() || "/";

  if (mode === "family") {
    const username = String(formData.get("username") ?? "").trim();
    if (!username || !password) {
      return { error: "Ingresá tu nombre y contraseña" };
    }

    const allPeople = await db.query.people.findMany();
    const norm = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const person = allPeople.find(
      (p) => norm(p.name) === norm(username) || norm(p.slug) === norm(username)
    );

    if (!person || !person.shareEnabled || !person.shareToken) {
      return { error: "Usuario no habilitado para consulta" };
    }

    const expectedPin = (person.sharePin ?? "").trim();
    if (!expectedPin) {
      return {
        error:
          "Esta cuenta aún no tiene contraseña asignada por el administrador (usá tu link directo)",
      };
    }

    if (password !== expectedPin) {
      return { error: "Contraseña incorrecta" };
    }

    const signed = await signPinToken(person.shareToken);
    const jar = await cookies();
    jar.set(`${VIEWER_PIN_COOKIE_PREFIX}${person.shareToken}`, signed, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });

    redirect(`/v/${person.shareToken}`);
  }

  const expected = (process.env.ADMIN_PASSWORD ?? "").trim();

  if (!expected || password !== expected) {
    return { error: "Contraseña de administrador incorrecta" };
  }

  const token = await signAdminToken();
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 días
  });

  redirect(nextPath.startsWith("/") ? nextPath : "/");
}

export async function logoutAdminAction() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/login");
}

export async function verifyFamilyPinAction(shareToken: string, pinInput: string) {
  const person = await db.query.people.findFirst({
    where: eq(people.shareToken, shareToken),
  });
  if (!person || !person.shareEnabled) {
    return { ok: false, error: "Enlace inválido o desactivado" };
  }
  if ((person.sharePin ?? "").trim() !== pinInput.trim()) {
    return { ok: false, error: "PIN incorrecto" };
  }

  const signed = await signPinToken(shareToken);
  const jar = await cookies();
  jar.set(`${VIEWER_PIN_COOKIE_PREFIX}${shareToken}`, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  revalidatePath(`/v/${shareToken}`);
  return { ok: true };
}

// ==========================================
// MOVIMIENTOS (INGRESO / EGRESO / TRANSFERENCIA)
// ==========================================

export async function createTransactionAction(input: {
  accountId: number;
  toAccountId?: number; // para TRANSFER
  date: string;
  type: "IN" | "OUT" | "YIELD" | "TRANSFER";
  amount: number;
  concept: string;
  notes?: string;
  refAmount?: number | null;
  refCurrency?: string | null;
  /** Solo TRANSFER entre personas distintas: préstamo o devolución que cuenta para la deuda. */
  affectsDebt?: boolean;
}) {
  await requireAdmin();

  const amt = Math.round(Math.abs(Number(input.amount)) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("El monto debe ser mayor a cero");
  }
  const txDate = input.date || todayISO();
  const concept = input.concept.trim() || (input.type === "TRANSFER" ? "Transferencia" : "Movimiento");

  if (input.type === "TRANSFER") {
    if (!input.toAccountId || input.toAccountId === input.accountId) {
      throw new Error("Seleccioná una cuenta destino distinta a la de origen");
    }
    const [fromAcc, toAcc] = await Promise.all([
      db.query.accounts.findFirst({
        where: eq(accounts.id, input.accountId),
        with: { person: true },
      }),
      db.query.accounts.findFirst({
        where: eq(accounts.id, input.toAccountId),
        with: { person: true },
      }),
    ]);
    if (!fromAcc || !toAcc) throw new Error("Cuentas no encontradas");

    const crossPerson = fromAcc.personId !== toAcc.personId;
    const affectsDebt = Boolean(input.affectsDebt);
    if (affectsDebt) {
      if (!crossPerson) {
        throw new Error("Solo una transferencia entre personas distintas puede contar como deuda");
      }
      if (fromAcc.currency !== toAcc.currency) {
        throw new Error("Un préstamo o devolución tiene que ser entre cuentas de la misma moneda");
      }
    }
    const toLabel = crossPerson ? `${toAcc.person.name} · ${toAcc.name}` : toAcc.name;
    const fromLabel = crossPerson ? `${fromAcc.person.name} · ${fromAcc.name}` : fromAcc.name;

    const groupId = crypto.randomUUID();
    await db.insert(transactions).values([
      {
        accountId: fromAcc.id,
        date: txDate,
        type: "TRANSFER_OUT",
        amount: amt.toFixed(2),
        concept: `${concept} (hacia ${toLabel})`,
        notes: input.notes?.trim() || null,
        transferGroupId: groupId,
        affectsDebt,
        sortOrder: 9000,
      },
      {
        accountId: toAcc.id,
        date: txDate,
        type: "TRANSFER_IN",
        amount: amt.toFixed(2),
        concept: `${concept} (desde ${fromLabel})`,
        notes: input.notes?.trim() || null,
        transferGroupId: groupId,
        affectsDebt,
        sortOrder: 9001,
      },
    ]);
  } else {
    await db.insert(transactions).values({
      accountId: input.accountId,
      date: txDate,
      type: input.type,
      amount: amt.toFixed(2),
      concept,
      notes: input.notes?.trim() || null,
      refAmount:
        input.refAmount && Number(input.refAmount) > 0
          ? Number(input.refAmount).toFixed(2)
          : null,
      refCurrency:
        input.refAmount && Number(input.refAmount) > 0 ? input.refCurrency || "USD" : null,
      sortOrder: 9000,
    });
  }

  revalidateAll();
}

export async function updateTransactionAction(input: {
  id: number;
  accountId: number;
  date: string;
  type: "IN" | "OUT" | "YIELD";
  amount: number;
  concept: string;
  notes?: string;
  refAmount?: number | null;
  refCurrency?: string | null;
}) {
  await requireAdmin();
  const amt = Math.round(Math.abs(Number(input.amount)) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("Monto inválido");
  }

  await db
    .update(transactions)
    .set({
      accountId: input.accountId,
      date: input.date,
      dateUnknown: false,
      type: input.type,
      amount: amt.toFixed(2),
      concept: input.concept.trim() || "Movimiento",
      notes: input.notes?.trim() || null,
      refAmount:
        input.refAmount && Number(input.refAmount) > 0
          ? Number(input.refAmount).toFixed(2)
          : null,
      refCurrency:
        input.refAmount && Number(input.refAmount) > 0 ? input.refCurrency || "USD" : null,
    })
    .where(eq(transactions.id, input.id));

  revalidateAll();
}

export async function deleteTransactionAction(id: number) {
  await requireAdmin();
  const existing = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
  });
  if (!existing) return;

  if (existing.transferGroupId) {
    await db
      .delete(transactions)
      .where(eq(transactions.transferGroupId, existing.transferGroupId));
  } else {
    await db.delete(transactions).where(eq(transactions.id, id));
  }
  revalidateAll();
}

// ==========================================
// ACCESO FAMILIAR (COMPARTIR LINK + PIN)
// ==========================================

export async function updateShareSettingsAction(input: {
  personId: number;
  shareEnabled: boolean;
  sharePin?: string;
  regenerateToken?: boolean;
}) {
  await requireAdmin();
  const person = await db.query.people.findFirst({
    where: eq(people.id, input.personId),
  });
  if (!person) throw new Error("Persona no encontrada");

  const nextToken =
    input.regenerateToken || !person.shareToken
      ? crypto.randomBytes(12).toString("base64url")
      : person.shareToken;

  const pinClean = (input.sharePin ?? "").trim();

  await db
    .update(people)
    .set({
      shareEnabled: input.shareEnabled,
      shareToken: nextToken,
      sharePin: pinClean.length > 0 ? pinClean : null,
    })
    .where(eq(people.id, input.personId));

  revalidateAll();
  return { shareToken: nextToken };
}

// ==========================================
// PERSONAS, SUBCUENTAS Y SERVICIOS FIJOS
// ==========================================

export async function createPersonAction(input: {
  name: string;
  defaultCurrency: "ARS" | "USD";
  initialAccountName?: string;
  initialBalance?: number;
  isOwn?: boolean;
}) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Nombre requerido");

  const baseSlug = slugify(name) || `persona-${Date.now()}`;
  const existing = await db.query.people.findFirst({ where: eq(people.slug, baseSlug) });
  const slug = existing ? `${baseSlug}-${Math.floor(Math.random() * 900 + 100)}` : baseSlug;

  const [created] = await db
    .insert(people)
    .values({
      name,
      slug,
      defaultCurrency: input.defaultCurrency,
      isOwn: Boolean(input.isOwn),
      hasManagedAccount: !input.isOwn,
      shareToken: crypto.randomBytes(12).toString("base64url"),
      shareEnabled: !input.isOwn,
      sortOrder: 50,
    })
    .returning();

  if (!input.isOwn) {
    await db.insert(accounts).values({
      personId: created.id,
      name: input.initialAccountName?.trim() || "Principal",
      currency: input.defaultCurrency,
      initialBalance: Number(input.initialBalance ?? 0).toFixed(2),
      sortOrder: 1,
    });
  }

  revalidateAll();
  return created;
}

export async function createAccountAction(input: {
  personId: number;
  name: string;
  currency: "ARS" | "USD";
  initialBalance?: number;
}) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Nombre de cuenta requerido");

  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.personId, input.personId),
  });

  await db.insert(accounts).values({
    personId: input.personId,
    name,
    currency: input.currency,
    initialBalance: Number(input.initialBalance ?? 0).toFixed(2),
    // La primera cuenta de una persona queda como predeterminada.
    isDefault: !existing,
    sortOrder: 10,
  });

  revalidateAll();
}

export async function updateAccountAction(input: {
  id: number;
  name: string;
  initialBalance: number;
}) {
  await requireAdmin();
  await db
    .update(accounts)
    .set({
      name: input.name.trim(),
      initialBalance: Number(input.initialBalance ?? 0).toFixed(2),
    })
    .where(eq(accounts.id, input.id));
  revalidateAll();
}

/** Marca una cuenta como predeterminada de su persona (y desmarca las demás). */
export async function setDefaultAccountAction(id: number) {
  await requireAdmin();
  const acc = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
  if (!acc) throw new Error("Cuenta no encontrada");
  if (!acc.isActive) throw new Error("No se puede predeterminar una cuenta inactiva");

  await db.batch([
    db.update(accounts).set({ isDefault: false }).where(eq(accounts.personId, acc.personId)),
    db.update(accounts).set({ isDefault: true }).where(eq(accounts.id, id)),
  ]);
  revalidateAll();
}

export async function deleteAccountAction(id: number) {
  await requireAdmin();
  const acc = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
  await db.delete(accounts).where(eq(accounts.id, id));

  // Si se borró la predeterminada, la primera cuenta restante pasa a serlo.
  if (acc?.isDefault) {
    const next = await db.query.accounts.findFirst({
      where: and(eq(accounts.personId, acc.personId), eq(accounts.isActive, true)),
      orderBy: [asc(accounts.sortOrder), asc(accounts.id)],
    });
    if (next) {
      await db.update(accounts).set({ isDefault: true }).where(eq(accounts.id, next.id));
    }
  }
  revalidateAll();
}

export async function updatePersonAction(input: {
  id: number;
  name: string;
  defaultCurrency: "ARS" | "USD";
  notes?: string;
  hasManagedAccount: boolean;
  shareEnabled: boolean;
  sharePin?: string;
}) {
  await requireAdmin();
  const person = await db.query.people.findFirst({
    where: eq(people.id, input.id),
    with: { accounts: true },
  });
  if (!person) throw new Error("Persona no encontrada");

  const cleanName = input.name.trim();
  if (!cleanName) throw new Error("El nombre no puede estar vacío");

  const shareToken =
    person.shareToken || crypto.randomBytes(12).toString("base64url");
  const cleanPin = (input.sharePin ?? "").trim();

  await db
    .update(people)
    .set({
      name: cleanName,
      defaultCurrency: input.defaultCurrency,
      notes: input.notes?.trim() || null,
      hasManagedAccount: input.hasManagedAccount,
      shareEnabled: input.shareEnabled,
      shareToken,
      sharePin: cleanPin.length > 0 ? cleanPin : null,
    })
    .where(eq(people.id, input.id));

  // Si activó "Llevar cuenta/saldo" y todavía no tenía ninguna subcuenta (ej: Fer), crearle Principal
  if (input.hasManagedAccount && person.accounts.length === 0) {
    await db.insert(accounts).values({
      personId: person.id,
      name: "Principal",
      currency: input.defaultCurrency,
      initialBalance: "0.00",
      sortOrder: 1,
    });
  }

  revalidateAll();
}

export async function deletePersonAction(id: number) {
  await requireAdmin();
  await db.delete(people).where(eq(people.id, id));
  revalidateAll();
}

export async function createServiceAction(input: {
  personId: number;
  name: string;
  defaultDueDay?: number | null;
  defaultAmount?: number | null;
  paysInArrears?: boolean;
  frequencyMonths?: number;
  startMonth?: number;
  notes?: string;
}) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Nombre del servicio requerido");
  const schedule = normalizeSchedule(input.frequencyMonths, input.startMonth);

  await db.insert(services).values({
    personId: input.personId,
    name,
    defaultDueDay: input.defaultDueDay || null,
    defaultAmount:
      input.defaultAmount && Number(input.defaultAmount) > 0
        ? Number(input.defaultAmount).toFixed(2)
        : null,
    paysInArrears: Boolean(input.paysInArrears),
    frequencyMonths: schedule.frequencyMonths,
    startMonth: schedule.startMonth,
    notes: input.notes?.trim() || null,
    isActive: true,
    sortOrder: 50,
  });
  revalidateAll();
}

function normalizeSchedule(frequencyMonths = 1, startMonth = 1) {
  if (!isValidFrequency(frequencyMonths)) {
    throw new Error("Frecuencia inválida: elegí mensual, bimestral, trimestral, cuatrimestral, semestral o anual");
  }
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new Error("El primer mes de pago tiene que estar entre 1 y 12");
  }
  return { frequencyMonths, startMonth };
}

/**
 * Cambia la frecuencia de un servicio. Solo afecta a los meses que se generen
 * de ahora en más: no toca ni borra ítems que ya existen.
 */
export async function updateServiceScheduleAction(input: {
  id: number;
  frequencyMonths: number;
  startMonth: number;
}) {
  await requireAdmin();
  const schedule = normalizeSchedule(input.frequencyMonths, input.startMonth);
  await db.update(services).set(schedule).where(eq(services.id, input.id));
  revalidateAll();
}

export async function toggleServiceActiveAction(id: number, isActive: boolean) {
  await requireAdmin();
  await db.update(services).set({ isActive }).where(eq(services.id, id));
  revalidateAll();
}

export async function toggleServiceArrearsAction(
  id: number,
  paysInArrears: boolean
) {
  await requireAdmin();
  await db.update(services).set({ paysInArrears }).where(eq(services.id, id));
  revalidateAll();
}

export async function updateServiceDueDayAction(
  id: number,
  defaultDueDay: number | null
) {
  await requireAdmin();
  const safeDay =
    defaultDueDay !== null &&
    Number.isFinite(defaultDueDay) &&
    defaultDueDay >= 1 &&
    defaultDueDay <= 31
      ? Math.round(defaultDueDay)
      : null;

  await db
    .update(services)
    .set({ defaultDueDay: safeDay })
    .where(eq(services.id, id));

  if (safeDay !== null) {
    const pendingItems = await db.query.monthlyItems.findMany({
      where: and(
        eq(monthlyItems.serviceId, id),
        eq(monthlyItems.status, "PENDING")
      ),
    });

    await Promise.all(
      pendingItems.map((item) =>
        db
          .update(monthlyItems)
          .set({ dueDate: clampDayForPeriod(item.period, safeDay) })
          .where(eq(monthlyItems.id, item.id))
      )
    );
  }

  revalidateAll();
}

export async function deleteServiceAction(id: number) {
  await requireAdmin();
  await db
    .delete(monthlyItems)
    .where(and(eq(monthlyItems.serviceId, id), eq(monthlyItems.status, "SKIPPED")));
  await db.delete(services).where(eq(services.id, id));
  revalidateAll();
}

// ==========================================
// PAGOS MENSUALES, EXTRAS Y LIQUIDACIÓN EN CUENTA
// ==========================================

function clampDayForPeriod(period: string, day: number): string {
  const [y, m] = period.split("-").map(Number);
  const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const safeDay = Math.max(1, Math.min(day, maxDay));
  return `${period}-${String(safeDay).padStart(2, "0")}`;
}

export async function generateMonthItemsAction(period: string) {
  await requireAdmin();

  const [activeServices, existingItems] = await Promise.all([
    db.query.services.findMany({ where: eq(services.isActive, true) }),
    db.query.monthlyItems.findMany({ where: eq(monthlyItems.period, period) }),
  ]);

  const visibleSrvIds = new Set(
    existingItems
      .filter((i) => i.status !== "SKIPPED")
      .map((i) => i.serviceId)
      .filter(Boolean)
  );
  const missingServices = activeServices.filter(
    (s) => serviceAppliesToPeriod(s, period) && !visibleSrvIds.has(s.id)
  );

  const toInsert: Array<typeof monthlyItems.$inferInsert> = [];
  const restoreOps: Array<Promise<unknown>> = [];

  for (const s of missingServices) {
    const skippedRows = existingItems.filter(
      (i) => i.serviceId === s.id && i.status === "SKIPPED"
    );

    if (skippedRows.length > 0) {
      const [primary, ...duplicates] = skippedRows;
      if (duplicates.length > 0) {
        restoreOps.push(
          db.delete(monthlyItems).where(
            inArray(
              monthlyItems.id,
              duplicates.map((d) => d.id)
            )
          )
        );
      }
      restoreOps.push(
        db
          .update(monthlyItems)
          .set({
            billedPeriod: s.paysInArrears ? shiftPeriod(period, -1) : period,
            personId: s.personId,
            kind: "SERVICE",
            concept: s.name,
            dueDate: clampDayForPeriod(period, s.defaultDueDay ?? 15),
            amount: s.defaultAmount ?? null,
            status: "PENDING",
            paidAt: null,
            settledTransactionId: null,
            notes: s.notes,
            sortOrder: s.sortOrder,
          })
          .where(eq(monthlyItems.id, primary.id))
      );
    } else {
      toInsert.push({
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
      });
    }
  }

  if (restoreOps.length > 0) {
    await Promise.all(restoreOps);
  }
  if (toInsert.length > 0) {
    await db.insert(monthlyItems).values(toInsert);
  }

  revalidateAll();
  return { added: missingServices.length };
}

export async function addMonthlyItemAction(input: {
  period: string;
  billedPeriod?: string | null;
  personId: number;
  kind: "SERVICE" | "EXTRA";
  concept: string;
  dueDate?: string | null;
  amount?: number | null;
  status?: "PENDING" | "PAID";
  notes?: string;
}) {
  await requireAdmin();
  const concept = input.concept.trim();
  if (!concept) throw new Error("Concepto requerido");

  const status = input.status ?? (input.kind === "EXTRA" ? "PAID" : "PENDING");
  await db.insert(monthlyItems).values({
    period: input.period,
    billedPeriod: input.billedPeriod || input.period,
    personId: input.personId,
    serviceId: null,
    kind: input.kind,
    concept,
    dueDate: input.dueDate || `${input.period}-15`,
    amount:
      input.amount !== null && input.amount !== undefined && Number(input.amount) >= 0
        ? Number(input.amount).toFixed(2)
        : null,
    status,
    paidAt: status === "PAID" ? todayISO() : null,
    notes: input.notes?.trim() || null,
    sortOrder: input.kind === "EXTRA" ? 80 : 40,
  });

  revalidateAll();
}

export async function updateMonthlyItemAction(input: {
  id: number;
  concept?: string;
  billedPeriod?: string | null;
  dueDate?: string | null;
  amount?: number | null;
  status?: "PENDING" | "PAID";
}) {
  await requireAdmin();
  const existing = await db.query.monthlyItems.findFirst({
    where: eq(monthlyItems.id, input.id),
  });
  if (!existing) throw new Error("Ítem no encontrado");

  const nextStatus = input.status ?? (existing.status as "PENDING" | "PAID");

  await db
    .update(monthlyItems)
    .set({
      concept: input.concept !== undefined ? input.concept.trim() : existing.concept,
      billedPeriod:
        input.billedPeriod !== undefined ? input.billedPeriod : existing.billedPeriod,
      dueDate: input.dueDate !== undefined ? input.dueDate : existing.dueDate,
      amount:
        input.amount !== undefined
          ? input.amount === null || Number.isNaN(Number(input.amount))
            ? null
            : Number(input.amount).toFixed(2)
          : existing.amount,
      status: nextStatus,
      paidAt:
        nextStatus === "PAID"
          ? existing.paidAt ?? todayISO()
          : null,
    })
    .where(eq(monthlyItems.id, input.id));

  revalidateAll();
}

export async function deleteMonthlyItemAction(id: number) {
  await requireAdmin();
  const existing = await db.query.monthlyItems.findFirst({
    where: eq(monthlyItems.id, id),
  });
  if (!existing) {
    revalidateAll();
    return;
  }

  if (existing.serviceId !== null) {
    // Si es un servicio del catálogo, lo marcamos como SKIPPED en este período
    // en lugar de eliminar la fila físicamente, para que la inicialización automática
    // de notificaciones/layout no vuelva a recrearlo.
    await Promise.all([
      db
        .delete(monthlyItems)
        .where(
          and(
            eq(monthlyItems.period, existing.period),
            eq(monthlyItems.serviceId, existing.serviceId),
            eq(monthlyItems.status, "SKIPPED"),
            ne(monthlyItems.id, existing.id)
          )
        ),
      db
        .delete(notificationDeliveries)
        .where(eq(notificationDeliveries.monthlyItemId, existing.id)),
    ]);

    await db
      .update(monthlyItems)
      .set({
        status: "SKIPPED",
        amount: null,
        paidAt: null,
        settledTransactionId: null,
      })
      .where(eq(monthlyItems.id, existing.id));
  } else {
    await db.delete(monthlyItems).where(eq(monthlyItems.id, existing.id));
  }

  revalidateAll();
}

// ==========================================
// DESCONTAR ÍTEMS MENSUALES EN CUENTA (con préstamo opcional de otra persona)
// ==========================================

/** Los ítems mensuales están en ARS: solo se descuentan de cuentas activas en pesos. */
async function getSettleAccount(accountId: number) {
  const acc = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
    with: { person: true },
  });
  if (!acc) throw new Error("Cuenta no encontrada");
  if (!acc.isActive) throw new Error(`La cuenta ${acc.name} está inactiva`);
  if (acc.currency !== "ARS") {
    throw new Error(`Solo se puede descontar en cuentas en pesos (${acc.name} es ${acc.currency})`);
  }
  return acc;
}

/**
 * Valida la cuenta del dueño (donde queda el egreso) y, si viene, la cuenta de la persona
 * que presta la plata. Devuelve ambas.
 */
async function resolveSettleAccounts(
  ownerPersonId: number,
  accountId: number,
  lenderAccountId?: number | null
) {
  const ownerAcc = await getSettleAccount(accountId);
  if (ownerAcc.personId !== ownerPersonId) {
    throw new Error("El gasto tiene que registrarse en una cuenta del dueño del ítem");
  }
  if (!lenderAccountId) return { ownerAcc, lenderAcc: null };

  const lenderAcc = await getSettleAccount(lenderAccountId);
  if (lenderAcc.personId === ownerPersonId) {
    throw new Error("La cuenta que presta tiene que ser de otra persona");
  }
  return { ownerAcc, lenderAcc };
}

type SettleAccount = Awaited<ReturnType<typeof getSettleAccount>>;

/**
 * Crea el egreso en la cuenta del dueño. Si hay prestador, además registra la transferencia
 * prestador → dueño marcada como deuda. Las tres filas comparten `transferGroupId` para que
 * borrar cualquiera deshaga el préstamo y el pago juntos.
 */
async function createSettlementTransactions(opts: {
  ownerAcc: SettleAccount;
  lenderAcc: SettleAccount | null;
  date: string;
  amount: number;
  concept: string;
  notes: string | null;
  settlementPeriod?: string;
}) {
  const amount = opts.amount.toFixed(2);
  const outValues = {
    accountId: opts.ownerAcc.id,
    date: opts.date,
    type: "OUT",
    amount,
    concept: opts.concept,
    notes: opts.notes,
    settlementPeriod: opts.settlementPeriod ?? null,
    sortOrder: 9002,
  };

  if (!opts.lenderAcc) {
    const [created] = await db
      .insert(transactions)
      .values({ ...outValues, sortOrder: 9000 })
      .returning();
    return created;
  }

  const lender = opts.lenderAcc;
  const owner = opts.ownerAcc;
  const groupId = crypto.randomUUID();
  const [, outRows] = await db.batch([
    db.insert(transactions).values([
      {
        accountId: lender.id,
        date: opts.date,
        type: "TRANSFER_OUT",
        amount,
        concept: `Préstamo a ${owner.person.name}: ${opts.concept} (hacia ${owner.person.name} · ${owner.name})`,
        notes: opts.notes,
        transferGroupId: groupId,
        affectsDebt: true,
        sortOrder: 9000,
      },
      {
        accountId: owner.id,
        date: opts.date,
        type: "TRANSFER_IN",
        amount,
        concept: `Préstamo de ${lender.person.name}: ${opts.concept} (desde ${lender.person.name} · ${lender.name})`,
        notes: opts.notes,
        transferGroupId: groupId,
        affectsDebt: true,
        sortOrder: 9001,
      },
    ]),
    db
      .insert(transactions)
      .values({ ...outValues, transferGroupId: groupId })
      .returning(),
  ]);
  return outRows[0];
}

/** Deshace los movimientos recién creados si otro request ya descontó los ítems. */
async function rollbackSettlement(tx: typeof transactions.$inferSelect) {
  if (tx.transferGroupId) {
    await db.delete(transactions).where(eq(transactions.transferGroupId, tx.transferGroupId));
  } else {
    await db.delete(transactions).where(eq(transactions.id, tx.id));
  }
}

/**
 * Descuenta UN ítem puntual en la cuenta elegida del dueño. Con `lenderAccountId`, la plata
 * sale de otra persona y queda registrada como deuda del dueño con ella.
 */
export async function settleSingleMonthlyItemAction(input: {
  itemId: number;
  accountId: number;
  lenderAccountId?: number | null;
  date?: string;
  concept?: string;
}) {
  await requireAdmin();
  const item = await db.query.monthlyItems.findFirst({
    where: eq(monthlyItems.id, input.itemId),
  });
  if (!item || item.status === "SKIPPED") throw new Error("Ítem no encontrado");
  if (item.settledTransactionId) throw new Error("Este ítem ya fue descontado en cuenta");

  const amt = Number(item.amount ?? 0);
  if (amt <= 0) throw new Error("Primero ingresá un importe mayor a $0 para descontar");

  const { ownerAcc, lenderAcc } = await resolveSettleAccounts(
    item.personId,
    input.accountId,
    input.lenderAccountId
  );

  const txDate = input.date || todayISO();
  const createdTx = await createSettlementTransactions({
    ownerAcc,
    lenderAcc,
    date: txDate,
    amount: amt,
    concept: input.concept?.trim() || item.concept,
    notes: `Pago mensual ${formatPeriodLabel(item.period)}`,
  });

  const updated = await db
    .update(monthlyItems)
    .set({
      status: "PAID",
      paidAt: item.paidAt ?? txDate,
      settledTransactionId: createdTx.id,
    })
    .where(and(eq(monthlyItems.id, item.id), isNull(monthlyItems.settledTransactionId)))
    .returning({ id: monthlyItems.id });

  if (updated.length === 0) {
    await rollbackSettlement(createdTx);
    throw new Error("Este ítem ya fue descontado en cuenta");
  }

  revalidateAll();
}

/**
 * Liquida TODOS los ítems con importe (servicios + extras no descontados aún) de una persona en un mes
 * generando un único movimiento "Servicios <Mes Año>" en la cuenta elegida (ej. Mamá -> Cocos).
 * Con `lenderAccountId`, el total sale de otra persona como préstamo.
 */
export async function settlePersonMonthSummaryAction(input: {
  period: string;
  personId: number;
  accountId: number;
  lenderAccountId?: number | null;
  date?: string;
  customConcept?: string;
}) {
  await requireAdmin();

  const { ownerAcc, lenderAcc } = await resolveSettleAccounts(
    input.personId,
    input.accountId,
    input.lenderAccountId
  );

  const items = await db.query.monthlyItems.findMany({
    where: and(
      eq(monthlyItems.period, input.period),
      eq(monthlyItems.personId, input.personId),
      ne(monthlyItems.status, "SKIPPED"),
      isNull(monthlyItems.settledTransactionId)
    ),
  });

  const validItems = items.filter((i) => Number(i.amount ?? 0) > 0);
  if (validItems.length === 0) {
    throw new Error("No hay ítems pendientes de descontar con monto mayor a $0 en este mes");
  }

  const total =
    Math.round(validItems.reduce((acc, i) => acc + Number(i.amount ?? 0), 0) * 100) / 100;

  const txDate = input.date || todayISO();
  const defaultLabel = `Servicios ${formatPeriodLabel(input.period)}`;
  const concept = input.customConcept?.trim() || defaultLabel;

  const detailNote = validItems
    .map((i) => `${i.concept}: ${formatMoney(i.amount, "ARS")}`)
    .join(" · ");

  const createdTx = await createSettlementTransactions({
    ownerAcc,
    lenderAcc,
    date: txDate,
    amount: total,
    concept,
    notes: detailNote,
    settlementPeriod: input.period,
  });

  const updated = await db
    .update(monthlyItems)
    .set({
      status: "PAID",
      paidAt: txDate,
      settledTransactionId: createdTx.id,
    })
    .where(
      and(
        inArray(
          monthlyItems.id,
          validItems.map((i) => i.id)
        ),
        isNull(monthlyItems.settledTransactionId)
      )
    )
    .returning({ id: monthlyItems.id });

  if (updated.length !== validItems.length) {
    // Otro request descontó parte de estos ítems en paralelo: deshacer todo para no duplicar.
    // Borrar los movimientos pone settledTransactionId en NULL (FK ON DELETE SET NULL).
    await rollbackSettlement(createdTx);
    throw new Error("Algunos ítems ya se descontaron mientras tanto. Recargá y volvé a intentar.");
  }

  revalidateAll();
  return { total, count: validItems.length };
}

// ==========================================
// NOTIFICACIONES DE VENCIMIENTOS (PUSH + CAMPANITA)
// ==========================================

export async function updateNotificationSettingsAction(input: {
  enabled: boolean;
  notifyTime: string;
  daysBefore: number;
  notifyOnDueDay: boolean;
  notifyOverdue: boolean;
}) {
  await requireAdmin();
  const current = await getOrCreateNotificationSettings();

  const rawTime = (input.notifyTime ?? "09:00").trim();
  const validTime = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : "09:00";
  const safeDays = Math.max(0, Math.min(30, Math.round(Number(input.daysBefore) || 0)));

  await db
    .update(notificationSettings)
    .set({
      enabled: Boolean(input.enabled),
      notifyTime: validTime,
      daysBefore: safeDays,
      notifyOnDueDay: Boolean(input.notifyOnDueDay),
      notifyOverdue: Boolean(input.notifyOverdue),
      updatedAt: new Date(),
    })
    .where(eq(notificationSettings.id, current.id));

  revalidateAll();
}

export async function savePushSubscriptionAction(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel?: string;
}) {
  await requireAdmin();
  const endpoint = input.endpoint?.trim();
  const p256dh = input.p256dh?.trim();
  const auth = input.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Datos de suscripción Push incompletos");
  }

  const label = input.deviceLabel?.trim() || "Dispositivo";
  const existing = await db.query.pushSubscriptions.findFirst({
    where: eq(pushSubscriptions.endpoint, endpoint),
  });

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({ p256dh, auth, deviceLabel: label })
      .where(eq(pushSubscriptions.id, existing.id));
  } else {
    await db.insert(pushSubscriptions).values({
      endpoint,
      p256dh,
      auth,
      deviceLabel: label,
    });
  }

  revalidateAll();
}

export async function deletePushSubscriptionAction(input: {
  id?: number;
  endpoint?: string;
}) {
  await requireAdmin();
  if (input.id) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, input.id));
  } else if (input.endpoint) {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint));
  }
  revalidateAll();
}

export async function sendTestNotificationAction() {
  await requireAdmin();
  return sendTestPushNotification();
}

export async function triggerDueNotificationsNowAction() {
  await requireAdmin();
  return dispatchDueNotifications({ force: true });
}
