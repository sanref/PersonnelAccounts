import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "crypto";
import path from "path";
import * as XLSX from "xlsx";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as dsql, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const EXCEL_PATH = path.resolve(process.cwd(), "_data", "MultiCuentas.xlsx");

function randomToken() {
  return crypto.randomBytes(12).toString("base64url");
}

function excelDateToISO(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "number") {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${m}-${d}`;
    }
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }
  return null;
}

/**
 * In Pagos Mensuales & Mama, headers like "Ene 25", "Dic 25", "Nov 26", "Sept 26"
 * were stored by Excel as dates where day = 2-digit year (24, 25, 26) and month = 1..12.
 */
function headerToPeriod(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s.startsWith("sept") && s.includes("26")) return "2026-09";
    return null;
  }
  let y = 0,
    m = 0,
    d = 0;
  if (val instanceof Date && !isNaN(val.getTime())) {
    y = val.getUTCFullYear();
    m = val.getUTCMonth() + 1;
    d = val.getUTCDate();
  } else if (typeof val === "number") {
    const p = XLSX.SSF.parse_date_code(val);
    if (p) {
      y = p.y;
      m = p.m;
      d = p.d;
    }
  }
  if (!m) return null;
  // Day 24, 25, 26 encodes 2024, 2025, 2026 when Excel parsed "Mes YY"
  const realYear = d >= 24 && d <= 30 ? 2000 + d : y;
  return `${realYear}-${String(m).padStart(2, "0")}`;
}

function num(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = typeof val === "number" ? val : Number(String(val).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function sheetGrid(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`No se encontró la hoja: ${name}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  console.log("Leyendo archivo:", EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });

  console.log("Limpiando datos previos para importación limpia...");
  await db.execute(
    dsql`TRUNCATE TABLE monthly_items, services, transactions, accounts, people RESTART IDENTITY CASCADE`
  );

  // 1. Crear Personas
  const insertedPeople = await db
    .insert(schema.people)
    .values([
      {
        name: "Mamá",
        slug: "mama",
        defaultCurrency: "ARS",
        isOwn: false,
        hasManagedAccount: true,
        shareToken: randomToken(),
        shareEnabled: true,
        notes: "Administración de cuentas (Cocos, Balanz, Otros) y servicios mensuales",
        sortOrder: 1,
      },
      {
        name: "Mer",
        slug: "mer",
        defaultCurrency: "ARS",
        isOwn: false,
        hasManagedAccount: true,
        shareToken: randomToken(),
        shareEnabled: true,
        notes: "Cuenta administrada en ARS (entradas y pagos)",
        sortOrder: 2,
      },
      {
        name: "Cami",
        slug: "cami",
        defaultCurrency: "USD",
        isOwn: false,
        hasManagedAccount: true,
        shareToken: randomToken(),
        shareEnabled: true,
        notes: "Ahorros administrados en USD",
        sortOrder: 3,
      },
      {
        name: "Lou",
        slug: "lou",
        defaultCurrency: "USD",
        isOwn: false,
        hasManagedAccount: true,
        shareToken: randomToken(),
        shareEnabled: true,
        notes: "Ahorros administrados en USD",
        sortOrder: 4,
      },
      {
        name: "Fer",
        slug: "fer",
        defaultCurrency: "ARS",
        isOwn: true,
        hasManagedAccount: false,
        shareEnabled: false,
        notes: "Servicios propios en Pagos Mensuales",
        sortOrder: 5,
      },
    ])
    .returning();

  const personBySlug = Object.fromEntries(insertedPeople.map((p) => [p.slug, p]));

  // 2. Crear Cuentas / Billeteras
  const insertedAccounts = await db
    .insert(schema.accounts)
    .values([
      // Mamá (Mama 2)
      {
        personId: personBySlug.mama.id,
        name: "Cocos",
        currency: "ARS",
        initialBalance: "1965925.40",
        sortOrder: 1,
      },
      {
        personId: personBySlug.mama.id,
        name: "Balanz",
        currency: "ARS",
        initialBalance: "1156958.87",
        sortOrder: 2,
      },
      {
        personId: personBySlug.mama.id,
        name: "Otros",
        currency: "ARS",
        initialBalance: "0",
        sortOrder: 3,
      },
      // Mer (R2 2024-09-19 ingreso 158743.79 dejó el saldo en 0.00 => saldo previo -158743.79)
      {
        personId: personBySlug.mer.id,
        name: "Principal",
        currency: "ARS",
        initialBalance: "-158743.79",
        sortOrder: 1,
      },
      // Cami
      {
        personId: personBySlug.cami.id,
        name: "Ahorros USD",
        currency: "USD",
        initialBalance: "0",
        sortOrder: 1,
      },
      // Lou
      {
        personId: personBySlug.lou.id,
        name: "Ahorros USD",
        currency: "USD",
        initialBalance: "0",
        sortOrder: 1,
      },
    ])
    .returning();

  const accMap = {
    mamaCocos: insertedAccounts.find((a) => a.personId === personBySlug.mama.id && a.name === "Cocos")!,
    mamaBalanz: insertedAccounts.find((a) => a.personId === personBySlug.mama.id && a.name === "Balanz")!,
    mamaOtros: insertedAccounts.find((a) => a.personId === personBySlug.mama.id && a.name === "Otros")!,
    mer: insertedAccounts.find((a) => a.personId === personBySlug.mer.id)!,
    cami: insertedAccounts.find((a) => a.personId === personBySlug.cami.id)!,
    lou: insertedAccounts.find((a) => a.personId === personBySlug.lou.id)!,
  };

  type TxInsert = typeof schema.transactions.$inferInsert;
  const allTx: TxInsert[] = [];

  // 3A. Importar hoja "Mer"
  const merRows = sheetGrid(wb, "Mer");
  let lastMerDate = "2024-09-19";
  for (let i = 1; i < merRows.length; i++) {
    const row = merRows[i];
    if (!row) continue;
    const dIso = excelDateToISO(row[0]);
    const inAmt = num(row[1]);
    const outAmt = num(row[2]);
    const conceptRaw = row[3] != null ? String(row[3]).trim() : "";
    if (inAmt === null && outAmt === null) continue;
    if (dIso) lastMerDate = dIso;

    // Detectar referencia en USD como "100 dol" o "133 dol"
    const usdMatch = conceptRaw.match(/^(\d+(?:[.,]\d+)?)\s*dol/i);
    const refUsd = usdMatch ? Number(usdMatch[1].replace(",", ".")) : null;

    if (inAmt !== null && inAmt > 0) {
      allTx.push({
        accountId: accMap.mer.id,
        date: dIso ?? lastMerDate,
        dateUnknown: !dIso,
        type: "IN",
        amount: inAmt.toFixed(2),
        concept: conceptRaw || "Ingreso",
        refAmount: refUsd ? refUsd.toFixed(2) : null,
        refCurrency: refUsd ? "USD" : null,
        notes: i === 1 ? "Cierre saldo anterior en $0,00" : null,
        sortOrder: i,
      });
    }
    if (outAmt !== null && outAmt > 0) {
      allTx.push({
        accountId: accMap.mer.id,
        date: dIso ?? lastMerDate,
        dateUnknown: !dIso,
        type: "OUT",
        amount: outAmt.toFixed(2),
        concept: conceptRaw || "Pago",
        sortOrder: i,
      });
    }
  }

  // 3B. Importar "Cami" y "Lou"
  for (const [sheetName, account] of [
    ["Cami", accMap.cami],
    ["Lou", accMap.lou],
  ] as const) {
    const rows = sheetGrid(wb, sheetName);
    let fallbackDate = "2023-01-01";
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const dIso = excelDateToISO(row[0]);
      if (dIso) fallbackDate = dIso;
      const inConcept = row[1] != null ? String(row[1]).trim() : "";
      const inArs = num(row[2]);
      const inUsd = num(row[3]);
      const outConcept = row[4] != null ? String(row[4]).trim() : "";
      const outUsd = num(row[5]);

      if (inUsd !== null && inUsd > 0) {
        allTx.push({
          accountId: account.id,
          date: dIso ?? fallbackDate,
          dateUnknown: !dIso,
          type: "IN",
          amount: inUsd.toFixed(2),
          concept: inConcept || "Aporte",
          refAmount: inArs && inArs > 0 ? inArs.toFixed(2) : null,
          refCurrency: inArs && inArs > 0 ? "ARS" : null,
          sortOrder: i * 2,
        });
      }
      if (outUsd !== null && outUsd > 0) {
        allTx.push({
          accountId: account.id,
          date: dIso ?? fallbackDate,
          dateUnknown: !dIso,
          type: "OUT",
          amount: outUsd.toFixed(2),
          concept: outConcept || "Retiro / Compra",
          sortOrder: i * 2 + 1,
        });
      }
    }
  }

  // 3C. Importar "Mama 2"
  const monthNameToNum: Record<string, string> = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };

  const mama2Rows = sheetGrid(wb, "Mama 2");
  for (let i = 3; i < mama2Rows.length; i++) {
    const row = mama2Rows[i];
    if (!row) continue;
    const dIso = excelDateToISO(row[0]);
    const concept = row[1] != null ? String(row[1]).trim() : "";
    const otrosIn = num(row[2]);
    const otrosOut = num(row[3]);
    const cocosIn = num(row[4]);
    const cocosOut = num(row[5]);
    const balanzIn = num(row[6]);
    const balanzOut = num(row[7]);

    if (
      otrosIn === null &&
      otrosOut === null &&
      cocosIn === null &&
      cocosOut === null &&
      balanzIn === null &&
      balanzOut === null
    ) {
      continue;
    }

    const txDate = dIso ?? "2026-01-01";

    // Caso transferencia entre Balanz y Cocos
    if (cocosIn && balanzOut && Math.abs(cocosIn - balanzOut) < 0.01) {
      const groupId = crypto.randomUUID();
      allTx.push({
        accountId: accMap.mamaBalanz.id,
        date: txDate,
        type: "TRANSFER_OUT",
        amount: balanzOut.toFixed(2),
        concept: concept || "Transferencia hacia Cocos",
        transferGroupId: groupId,
        sortOrder: i * 2,
      });
      allTx.push({
        accountId: accMap.mamaCocos.id,
        date: txDate,
        type: "TRANSFER_IN",
        amount: cocosIn.toFixed(2),
        concept: concept || "Transferencia desde Balanz",
        transferGroupId: groupId,
        sortOrder: i * 2 + 1,
      });
      continue;
    }

    // Detectar periodo si es "Servicios <Mes>"
    let settlementPeriod: string | null = null;
    const mMatch = concept.toLowerCase().match(/^servicios\s+([a-záéíóú]+)/i);
    if (mMatch) {
      const mNum = monthNameToNum[mMatch[1].toLowerCase()];
      if (mNum) {
        const yr = mNum === "12" && txDate.startsWith("2025") ? "2025" : txDate.slice(0, 4);
        settlementPeriod = `${yr}-${mNum}`;
      }
    }

    const pushLegs = (
      accId: number,
      inVal: number | null,
      outVal: number | null,
      offset: number
    ) => {
      if (inVal && inVal > 0) {
        const isYield = concept.toLowerCase().includes("ganancia") || concept.toLowerCase().includes("rendimiento");
        allTx.push({
          accountId: accId,
          date: txDate,
          type: isYield ? "YIELD" : "IN",
          amount: inVal.toFixed(2),
          concept: concept || "Ingreso",
          sortOrder: i * 10 + offset,
        });
      }
      if (outVal && outVal > 0) {
        allTx.push({
          accountId: accId,
          date: txDate,
          type: "OUT",
          amount: outVal.toFixed(2),
          concept: concept || "Egreso",
          settlementPeriod,
          sortOrder: i * 10 + offset + 1,
        });
      }
    };

    pushLegs(accMap.mamaOtros.id, otrosIn, otrosOut, 0);
    pushLegs(accMap.mamaCocos.id, cocosIn, cocosOut, 2);
    pushLegs(accMap.mamaBalanz.id, balanzIn, balanzOut, 4);
  }

  // Insertar transacciones en lotes de 100
  const insertedTx: (typeof schema.transactions.$inferSelect)[] = [];
  for (let i = 0; i < allTx.length; i += 100) {
    const batch = allTx.slice(i, i + 100);
    const res = await db.insert(schema.transactions).values(batch).returning();
    insertedTx.push(...res);
  }

  const mamaSettlementTxByPeriod = new Map<string, number>();
  for (const tx of insertedTx) {
    if (tx.accountId === accMap.mamaCocos.id && tx.settlementPeriod) {
      mamaSettlementTxByPeriod.set(tx.settlementPeriod, tx.id);
    }
  }

  // 4. Catálogo de Servicios Fijos (Mamá, Fer y Mer lista para usar)
  const serviceDefs = [
    // Mamá
    { key: "mama_personal", personId: personBySlug.mama.id, name: "Personal", defaultDueDay: 3, sortOrder: 1 },
    { key: "mama_ecogas", personId: personBySlug.mama.id, name: "EcoGas", defaultDueDay: 5, sortOrder: 2 },
    { key: "mama_arca", personId: personBySlug.mama.id, name: "ARCA (Monotributo)", defaultDueDay: 20, sortOrder: 3 },
    { key: "mama_epec", personId: personBySlug.mama.id, name: "EPEC", defaultDueDay: 24, sortOrder: 4 },
    { key: "mama_epec_sitio", personId: personBySlug.mama.id, name: "EPEC Sitio", defaultDueDay: 24, sortOrder: 5 },
    { key: "mama_netflix", personId: personBySlug.mama.id, name: "Netflix", defaultDueDay: 10, defaultAmount: "16000.00", sortOrder: 6 },
    // Fer
    { key: "fer_mandala", personId: personBySlug.fer.id, name: "Mandala", defaultDueDay: 6, sortOrder: 10 },
    { key: "fer_ecogas", personId: personBySlug.fer.id, name: "EcoGas Fer", defaultDueDay: 10, sortOrder: 11 },
    { key: "fer_ninjutsu", personId: personBySlug.fer.id, name: "Ninjutsu", defaultDueDay: 13, sortOrder: 12 },
    { key: "fer_visa_santander", personId: personBySlug.fer.id, name: "Visa Santander", defaultDueDay: 13, sortOrder: 13 },
    { key: "fer_epec", personId: personBySlug.fer.id, name: "EPEC Fer", defaultDueDay: 18, sortOrder: 14 },
    { key: "fer_claro", personId: personBySlug.fer.id, name: "Claro Fer", defaultDueDay: 15, sortOrder: 15 },
    { key: "fer_mp", personId: personBySlug.fer.id, name: "Tarjeta Mercado Pago", defaultDueDay: 15, sortOrder: 16 },
    { key: "fer_apross", personId: personBySlug.fer.id, name: "Sofía APROSS", defaultDueDay: 15, paysInArrears: true, sortOrder: 17 },
    { key: "fer_daspu", personId: personBySlug.fer.id, name: "Sofía DASPU", defaultDueDay: 15, paysInArrears: true, sortOrder: 18 },
    { key: "fer_visa_galicia", personId: personBySlug.fer.id, name: "Visa Galicia", defaultDueDay: 20, sortOrder: 19 },
    { key: "fer_amex", personId: personBySlug.fer.id, name: "Amex Santander", defaultDueDay: 20, sortOrder: 20 },
    // Mer (pre-cargados según tus pagos recurrentes en hoja Mer, editables en Config)
    {
      key: "mer_zurich",
      personId: personBySlug.mer.id,
      name: "Zurich Argentina",
      defaultDueDay: 3,
      notes: "Póliza 026496700-0",
      sortOrder: 30,
    },
    {
      key: "mer_sancristobal",
      personId: personBySlug.mer.id,
      name: "San Cristóbal",
      defaultDueDay: 3,
      notes: "Póliza 1030132055135-001-004",
      sortOrder: 31,
    },
  ];

  const insertedServices = await db
    .insert(schema.services)
    .values(
      serviceDefs.map(({ key: _k, ...rest }) => ({
        ...rest,
        isActive: true,
      }))
    )
    .returning();

  const srvByKey = Object.fromEntries(
    serviceDefs.map((d, idx) => [d.key, insertedServices[idx]])
  );

  type MonthlyInsert = typeof schema.monthlyItems.$inferInsert;
  const allMonthly: MonthlyInsert[] = [];

  // 5A. Importar servicios de Fer desde "Pagos Mensuales" (cols D..U = índices 3..20)
  const pmRows = sheetGrid(wb, "Pagos Mensuales");
  const pmHeaderPeriods: Record<number, string> = {};
  for (let c = 3; c <= 20; c++) {
    const p = headerToPeriod(pmRows[0]?.[c]);
    if (p) pmHeaderPeriods[c] = p;
  }

  const pmFerRowMap: Record<number, string> = {
    3: "fer_mandala", // R4 (0-based 3)
    4: "fer_ecogas", // R5
    5: "fer_ninjutsu", // R6
    6: "fer_visa_santander", // R7
    7: "fer_epec", // R8
    11: "fer_claro", // R12
    12: "fer_mp", // R13
    14: "fer_apross", // R15
    15: "fer_daspu", // R16
    16: "fer_visa_galicia", // R17
    17: "fer_amex", // R18
  };

  for (const [rStr, srvKey] of Object.entries(pmFerRowMap)) {
    const r = Number(rStr);
    const srv = srvByKey[srvKey];
    const row = pmRows[r];
    if (!row || !srv) continue;

    for (const [cStr, period] of Object.entries(pmHeaderPeriods)) {
      const c = Number(cStr);
      const amt = num(row[c]);
      if (srv.paysInArrears) {
        if (amt === null) continue;
        const [y, m] = period.split("-").map(Number);
        const nextD = new Date(Date.UTC(y, m, 1));
        const payPeriod = `${nextD.getUTCFullYear()}-${String(nextD.getUTCMonth() + 1).padStart(2, "0")}`;
        const dueDay = String(srv.defaultDueDay ?? 15).padStart(2, "0");
        const isCurrentNov = payPeriod >= "2026-11";
        allMonthly.push({
          period: payPeriod,
          billedPeriod: period,
          personId: personBySlug.fer.id,
          serviceId: srv.id,
          kind: "SERVICE",
          concept: srv.name,
          dueDate: `${payPeriod}-${dueDay}`,
          amount: amt.toFixed(2),
          status: isCurrentNov ? "PENDING" : "PAID",
          paidAt: isCurrentNov ? null : `${payPeriod}-${dueDay}`,
          sortOrder: srv.sortOrder,
        });
        continue;
      }
      if (amt === null && period !== "2026-11") continue;
      const dueDay = String(srv.defaultDueDay ?? 15).padStart(2, "0");
      // En 2026-11 los que ya tienen importe o anteriores a Nov 2026 están pagados/cargados
      const isCurrentPending = period === "2026-11" && amt === null;
      allMonthly.push({
        period,
        billedPeriod: period,
        personId: personBySlug.fer.id,
        serviceId: srv.id,
        kind: "SERVICE",
        concept: srv.name,
        dueDate: `${period}-${dueDay}`,
        amount: amt !== null ? amt.toFixed(2) : null,
        status: isCurrentPending ? "PENDING" : "PAID",
        paidAt: isCurrentPending ? null : `${period}-${dueDay}`,
        sortOrder: srv.sortOrder,
      });
    }
  }

  // 5B. Importar historial completo de Mamá desde "Mama" (Oct 2024 .. Nov 2026) vinculado a Mama 2
  const mamaRows = sheetGrid(wb, "Mama");
  const mamaPeriods: Record<number, string> = {};
  for (let c = 1; c <= 26; c++) {
    const p = headerToPeriod(mamaRows[0]?.[c]);
    if (p) mamaPeriods[c] = p;
  }

  const mamaServiceRows: Array<{ r: number; srvKey: string }> = [
    { r: 1, srvKey: "mama_personal" }, // R2 Personal
    { r: 2, srvKey: "mama_epec" }, // R3 EPEC
    { r: 3, srvKey: "mama_epec_sitio" }, // R4 EPEC Sitio
    { r: 4, srvKey: "mama_ecogas" }, // R5 EcoGas
    { r: 5, srvKey: "mama_netflix" }, // R6 Netflix
    { r: 7, srvKey: "mama_arca" }, // R8 Monotributo / ARCA
  ];

  for (const [cStr, period] of Object.entries(mamaPeriods)) {
    const c = Number(cStr);
    const settledTxId = mamaSettlementTxByPeriod.get(period) ?? null;
    const isPastOrSettled = period < "2026-11" || settledTxId !== null;

    for (const { r, srvKey } of mamaServiceRows) {
      const amt = num(mamaRows[r]?.[c]);
      if (amt === null) continue;
      // Nota: en H (2025-04, col index 7), Netflix $10.000 estaba fuera de la fórmula SUM(H2:H5),
      // pero para P..AA (2025-12..2026-11) todos los ítems suman exacto al descuento de Mama 2.
      const srv = srvByKey[srvKey];
      const dueDay = String(srv.defaultDueDay ?? 15).padStart(2, "0");
      allMonthly.push({
        period,
        personId: personBySlug.mama.id,
        serviceId: srv.id,
        kind: "SERVICE",
        concept: srv.name,
        dueDate: `${period}-${dueDay}`,
        amount: amt.toFixed(2),
        status: isPastOrSettled ? "PAID" : "PAID", // En Nov 2026 ya cargaste los importes de Mamá
        paidAt: `${period}-${dueDay}`,
        settledTransactionId: settledTxId,
        sortOrder: srv.sortOrder,
      });
    }

    // R7 (index 6): Viaje Lou (extra en cuotas Jul-Nov 2025)
    const viajeLou = num(mamaRows[6]?.[c]);
    if (viajeLou !== null) {
      allMonthly.push({
        period,
        personId: personBySlug.mama.id,
        serviceId: null,
        kind: "EXTRA",
        concept: "Viaje Lou",
        dueDate: `${period}-15`,
        amount: viajeLou.toFixed(2),
        status: "PAID",
        paidAt: `${period}-15`,
        settledTransactionId: settledTxId,
        sortOrder: 50,
      });
    }
  }

  // Extras puntuales en filas R10..R14 de "Mama":
  // Col F (index 5 = 2025-02): R10=149363.36 (Impuestos), R11=37817.77 (Impuestos 2)
  // Col L (index 11 = 2025-08): R10=300219.96 (Tablet), R11=35899.99 (Funda tablet), R12=100000 (Vacaciones Lou Cami), R13=50000 (Nafta Fer), R14=105738.53 (Impuesto Mer)
  // Col M (index 12 = 2025-09): R14=105738.53 (Impuesto Mer)
  // Col N (index 13 = 2025-10): R14=105738.53 (Impuesto Mer)
  // Col R (index 17 = 2026-02): R10=48520.19 (Impuestos casa Alejandro)
  // Col S (index 18 = 2026-03): R10=150280.00 (Impuestos casa Alejandro)
  const manualExtras: Array<{ period: string; concept: string; amount: number }> = [
    { period: "2025-02", concept: "Impuestos", amount: 149363.36 },
    { period: "2025-02", concept: "Impuestos (adicional)", amount: 37817.77 },
    { period: "2025-08", concept: "Tablet", amount: 300219.96 },
    { period: "2025-08", concept: "Funda tablet", amount: 35899.99 },
    { period: "2025-08", concept: "Vacaciones Lou Cami", amount: 100000.0 },
    { period: "2025-08", concept: "Nafta Fer", amount: 50000.0 },
    { period: "2025-08", concept: "Impuesto Mer", amount: 105738.53 },
    { period: "2025-09", concept: "Impuesto Mer", amount: 105738.53 },
    { period: "2025-10", concept: "Impuesto Mer", amount: 105738.53 },
    { period: "2026-02", concept: "Impuestos (casa Alejandro)", amount: 48520.19 },
    { period: "2026-03", concept: "Impuestos (casa Alejandro)", amount: 150280.0 },
  ];

  for (const ex of manualExtras) {
    allMonthly.push({
      period: ex.period,
      personId: personBySlug.mama.id,
      serviceId: null,
      kind: "EXTRA",
      concept: ex.concept,
      dueDate: `${ex.period}-20`,
      amount: ex.amount.toFixed(2),
      status: "PAID",
      paidAt: `${ex.period}-20`,
      settledTransactionId: mamaSettlementTxByPeriod.get(ex.period) ?? null,
      sortOrder: 60,
    });
  }

  for (let i = 0; i < allMonthly.length; i += 100) {
    await db.insert(schema.monthlyItems).values(allMonthly.slice(i, i + 100));
  }

  // 6. Verificación automática de saldos contra Excel
  console.log("\n=== VERIFICACIÓN DE SALDOS EN NEON ===");
  const allAccs = await db.query.accounts.findMany({
    with: { person: true, transactions: true },
  });

  for (const acc of allAccs) {
    let bal = Number(acc.initialBalance);
    for (const tx of acc.transactions) {
      const a = Number(tx.amount);
      if (tx.type === "IN" || tx.type === "YIELD" || tx.type === "TRANSFER_IN") {
        bal += a;
      } else {
        bal -= a;
      }
    }
    console.log(
      `  ${acc.person.name} -> ${acc.name} (${acc.currency}): ${bal.toFixed(2)} (${acc.transactions.length} movs)`
    );
  }

  // Verificar resumen Nov 2026 de Mamá
  const novMama = await db.query.monthlyItems.findMany({
    where: eq(schema.monthlyItems.period, "2026-11"),
  });
  const novMamaTotal = novMama
    .filter((i) => i.personId === personBySlug.mama.id)
    .reduce((acc, i) => acc + Number(i.amount ?? 0), 0);
  console.log(`  Resumen Mamá 2026-11 (sin descontar aún): $${novMamaTotal.toFixed(2)}`);
  console.log("\nImportación completada con éxito.");
}

main().catch((err) => {
  console.error("Error importando Excel:", err);
  process.exit(1);
});
