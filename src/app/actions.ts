"use server";

import crypto from "crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, people, accounts, transactions, services, monthlyItems } from "@/db";
import {
  ADMIN_COOKIE,
  VIEWER_PIN_COOKIE_PREFIX,
  requireAdmin,
  signAdminToken,
  signPinToken,
} from "@/lib/auth";
import { formatPeriodLabel, shiftPeriod, todayISO } from "@/lib/format";

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
      db.query.accounts.findFirst({ where: eq(accounts.id, input.accountId) }),
      db.query.accounts.findFirst({ where: eq(accounts.id, input.toAccountId) }),
    ]);
    if (!fromAcc || !toAcc) throw new Error("Cuentas no encontradas");

    const groupId = crypto.randomUUID();
    await db.insert(transactions).values([
      {
        accountId: fromAcc.id,
        date: txDate,
        type: "TRANSFER_OUT",
        amount: amt.toFixed(2),
        concept: `${concept} (hacia ${toAcc.name})`,
        notes: input.notes?.trim() || null,
        transferGroupId: groupId,
        sortOrder: 9000,
      },
      {
        accountId: toAcc.id,
        date: txDate,
        type: "TRANSFER_IN",
        amount: amt.toFixed(2),
        concept: `${concept} (desde ${fromAcc.name})`,
        notes: input.notes?.trim() || null,
        transferGroupId: groupId,
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

  await db.insert(accounts).values({
    personId: input.personId,
    name,
    currency: input.currency,
    initialBalance: Number(input.initialBalance ?? 0).toFixed(2),
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

export async function deleteAccountAction(id: number) {
  await requireAdmin();
  await db.delete(accounts).where(eq(accounts.id, id));
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
  notes?: string;
}) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Nombre del servicio requerido");

  await db.insert(services).values({
    personId: input.personId,
    name,
    defaultDueDay: input.defaultDueDay || null,
    defaultAmount:
      input.defaultAmount && Number(input.defaultAmount) > 0
        ? Number(input.defaultAmount).toFixed(2)
        : null,
    paysInArrears: Boolean(input.paysInArrears),
    notes: input.notes?.trim() || null,
    isActive: true,
    sortOrder: 50,
  });
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

export async function deleteServiceAction(id: number) {
  await requireAdmin();
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

  const existingSrvIds = new Set(existingItems.map((i) => i.serviceId).filter(Boolean));
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

  revalidateAll();
  return { added: toCreate.length };
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
  await db.delete(monthlyItems).where(eq(monthlyItems.id, id));
  revalidateAll();
}

/**
 * Descuenta UN ítem puntual directamente en la cuenta elegida de la persona
 * (ideal para pagos individuales de Mer como Zurich / San Cristóbal).
 */
export async function settleSingleMonthlyItemAction(input: {
  itemId: number;
  accountId: number;
  date?: string;
}) {
  await requireAdmin();
  const item = await db.query.monthlyItems.findFirst({
    where: eq(monthlyItems.id, input.itemId),
  });
  if (!item) throw new Error("Ítem no encontrado");
  if (item.settledTransactionId) throw new Error("Este ítem ya fue descontado en cuenta");

  const amt = Number(item.amount ?? 0);
  if (amt <= 0) throw new Error("Primero ingresá un importe mayor a $0 para descontar");

  const txDate = input.date || todayISO();
  const [createdTx] = await db
    .insert(transactions)
    .values({
      accountId: input.accountId,
      date: txDate,
      type: "OUT",
      amount: amt.toFixed(2),
      concept: item.concept,
      notes: `Pago mensual ${formatPeriodLabel(item.period)}`,
      sortOrder: 9000,
    })
    .returning();

  await db
    .update(monthlyItems)
    .set({
      status: "PAID",
      paidAt: item.paidAt ?? txDate,
      settledTransactionId: createdTx.id,
    })
    .where(eq(monthlyItems.id, item.id));

  revalidateAll();
}

/**
 * Liquida TODOS los ítems con importe (servicios + extras no descontados aún) de una persona en un mes
 * generando un único movimiento "Servicios <Mes Año>" en la cuenta elegida (ej. Mamá -> Cocos).
 */
export async function settlePersonMonthSummaryAction(input: {
  period: string;
  personId: number;
  accountId: number;
  date?: string;
  customConcept?: string;
}) {
  await requireAdmin();

  const items = await db.query.monthlyItems.findMany({
    where: and(
      eq(monthlyItems.period, input.period),
      eq(monthlyItems.personId, input.personId),
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
    .map((i) => `${i.concept}: $${Number(i.amount).toLocaleString("es-AR")}`)
    .join(" · ");

  const [createdTx] = await db
    .insert(transactions)
    .values({
      accountId: input.accountId,
      date: txDate,
      type: "OUT",
      amount: total.toFixed(2),
      concept,
      notes: detailNote,
      settlementPeriod: input.period,
      sortOrder: 9000,
    })
    .returning();

  await db
    .update(monthlyItems)
    .set({
      status: "PAID",
      paidAt: txDate,
      settledTransactionId: createdTx.id,
    })
    .where(
      inArray(
        monthlyItems.id,
        validItems.map((i) => i.id)
      )
    );

  revalidateAll();
  return { total, count: validItems.length };
}
