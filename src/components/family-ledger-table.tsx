"use client";

import { useState, useMemo } from "react";
import { FilterX } from "lucide-react";
import type { AccountSummary, LedgerRow } from "@/lib/queries";
import { formatDateAR, formatMoney, formatPeriodLabel } from "@/lib/format";

export function FamilyLedgerTable({
  rows,
  accounts,
  defaultCurrency,
}: {
  rows: LedgerRow[];
  accounts: AccountSummary[];
  defaultCurrency: string;
}) {
  const [colPeriod, setColPeriod] = useState("");
  const [colConcept, setColConcept] = useState("");
  const [colAccount, setColAccount] = useState<number | "ALL">("ALL");
  const [colType, setColType] = useState<"ALL" | "IN" | "OUT">("ALL");

  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (!r.dateUnknown && r.date) s.add(r.date.slice(0, 7));
    }
    return Array.from(s).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = colConcept.trim().toLowerCase();
    return rows.filter((r) => {
      if (colPeriod && (r.dateUnknown || !r.date.startsWith(colPeriod))) return false;
      if (colAccount !== "ALL" && r.accountId !== colAccount) return false;
      if (q && !`${r.concept} ${r.notes ?? ""}`.toLowerCase().includes(q)) return false;
      if (colType === "IN" && r.signedAmount <= 0) return false;
      if (colType === "OUT" && r.signedAmount >= 0) return false;
      return true;
    });
  }, [rows, colPeriod, colAccount, colConcept, colType]);

  const hasFilters =
    colPeriod !== "" || colConcept.trim() !== "" || colAccount !== "ALL" || colType !== "ALL";

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">
          Historial de Movimientos ({filtered.length} de {rows.length})
        </h2>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setColPeriod("");
              setColConcept("");
              setColAccount("ALL");
              setColType("ALL");
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 cursor-pointer"
          >
            <FilterX className="w-3.5 h-3.5" />
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
            <tr className="uppercase">
              <th className="text-left px-4 py-2.5 font-semibold">Fecha</th>
              <th className="text-left px-4 py-2.5 font-semibold">Concepto</th>
              {accounts.length > 1 && (
                <th className="text-left px-3 py-2.5 font-semibold">Cuenta</th>
              )}
              <th className="text-right px-4 py-2.5 font-semibold">Entrada</th>
              <th className="text-right px-4 py-2.5 font-semibold">Salida</th>
              <th className="text-right px-4 py-2.5 font-semibold">Saldo</th>
            </tr>
            <tr className="border-t border-slate-200/80 bg-slate-100/70">
              <th className="px-3 py-2">
                <select
                  value={colPeriod}
                  onChange={(e) => setColPeriod(e.target.value)}
                  className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-normal text-slate-700"
                >
                  <option value="">Todo período</option>
                  {availableMonths.map((ym) => (
                    <option key={ym} value={ym}>
                      {formatPeriodLabel(ym)}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-3 py-2">
                <input
                  type="text"
                  value={colConcept}
                  onChange={(e) => setColConcept(e.target.value)}
                  placeholder="Filtrar concepto..."
                  className="w-full min-w-32 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-normal text-slate-800 focus:outline-none"
                />
              </th>
              {accounts.length > 1 && (
                <th className="px-2 py-2">
                  <select
                    value={colAccount === "ALL" ? "ALL" : String(colAccount)}
                    onChange={(e) =>
                      setColAccount(
                        e.target.value === "ALL" ? "ALL" : Number(e.target.value)
                      )
                    }
                    className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-normal text-slate-700"
                  >
                    <option value="ALL">Todas</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </th>
              )}
              <th colSpan={2} className="px-2 py-2">
                <select
                  value={colType}
                  onChange={(e) =>
                    setColType(e.target.value as "ALL" | "IN" | "OUT")
                  }
                  className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-normal text-slate-700"
                >
                  <option value="ALL">Entradas y Salidas</option>
                  <option value="IN">Solo Entradas</option>
                  <option value="OUT">Solo Salidas</option>
                </select>
              </th>
              <th></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 tabular-nums">
            {filtered.map((row) => {
              const isPos = row.signedAmount > 0;
              return (
                <tr key={row.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-600">
                    {formatDateAR(row.date, row.dateUnknown)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{row.concept}</div>
                    {row.refAmount && row.refCurrency && (
                      <span className="text-xs text-slate-600">
                        Ref: {formatMoney(row.refAmount, row.refCurrency)}
                      </span>
                    )}
                  </td>
                  {accounts.length > 1 && (
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {row.accountName}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap font-semibold text-emerald-600">
                    {isPos ? formatMoney(row.amount, defaultCurrency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap font-semibold text-rose-600">
                    {!isPos ? formatMoney(row.amount, defaultCurrency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap font-semibold text-slate-800">
                    {formatMoney(row.runningBalance, defaultCurrency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
