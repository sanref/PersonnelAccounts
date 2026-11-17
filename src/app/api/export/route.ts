import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { asc, desc, ne } from "drizzle-orm";
import { db, people, accounts, transactions, monthlyItems } from "@/db";
import { isAdminAuthenticated } from "@/lib/auth";
import { computeSignedDelta } from "@/lib/queries";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const [allPeople, allMonthly] = await Promise.all([
    db.query.people.findMany({
      orderBy: [asc(people.sortOrder)],
      with: {
        accounts: {
          orderBy: [asc(accounts.sortOrder)],
          with: {
            transactions: {
              orderBy: [asc(transactions.date), asc(transactions.sortOrder), asc(transactions.id)],
            },
          },
        },
      },
    }),
    db.query.monthlyItems.findMany({
      where: ne(monthlyItems.status, "SKIPPED"),
      orderBy: [desc(monthlyItems.period), asc(monthlyItems.sortOrder)],
      with: { person: true },
    }),
  ]);

  const wb = XLSX.utils.book_new();

  // Hoja 1: Resumen de Saldos
  const summaryRows: Array<Record<string, unknown>> = [];
  for (const p of allPeople) {
    for (const a of p.accounts) {
      let bal = Number(a.initialBalance);
      for (const tx of a.transactions) {
        bal += computeSignedDelta(tx.type, Number(tx.amount));
      }
      summaryRows.push({
        Persona: p.name,
        Cuenta: a.name,
        Moneda: a.currency,
        Saldo_Inicial: Number(a.initialBalance),
        Saldo_Actual: Math.round(bal * 100) / 100,
        Movimientos: a.transactions.length,
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Saldos");

  // Una hoja por persona administrada
  for (const p of allPeople.filter((x) => x.accounts.length > 0)) {
    const rows: Array<Record<string, unknown>> = [];
    for (const a of p.accounts) {
      let running = Number(a.initialBalance);
      for (const tx of a.transactions) {
        const amt = Number(tx.amount);
        const signed = computeSignedDelta(tx.type, amt);
        running = Math.round((running + signed) * 100) / 100;
        rows.push({
          Fecha: tx.dateUnknown ? "Sin fecha" : tx.date,
          Cuenta: a.name,
          Tipo: tx.type,
          Concepto: tx.concept,
          Entrada: signed > 0 ? amt : "",
          Salida: signed < 0 ? amt : "",
          Saldo_Cuenta: running,
          Moneda: a.currency,
          Monto_Referencia: tx.refAmount ? Number(tx.refAmount) : "",
          Moneda_Referencia: tx.refCurrency ?? "",
          Notas: tx.notes ?? "",
          Afecta_Deuda: tx.affectsDebt ? "Sí" : "No",
        });
      }
    }
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows),
      p.name.slice(0, 28)
    );
  }

  // Hoja Pagos Mensuales + Extras
  const pmSheetRows = allMonthly.map((m) => ({
    Periodo: m.period,
    Persona: m.person.name,
    Tipo: m.kind === "EXTRA" ? "Extra del mes" : "Servicio fijo",
    Concepto: m.concept,
    Vencimiento: m.dueDate ?? "",
    Monto: m.amount ? Number(m.amount) : "",
    Estado: m.status === "PAID" ? "Pagado" : "Pendiente",
    Descontado_En_Cuenta: m.settledTransactionId ? "Sí" : "No",
    Notas: m.notes ?? "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pmSheetRows), "Pagos_Mensuales");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="MultiCuentas_Backup_${dateStamp}.xlsx"`,
    },
  });
}
