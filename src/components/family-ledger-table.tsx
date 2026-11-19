"use client";

import { useState, useMemo } from "react";
import { FilterX, History } from "lucide-react";
import type { AccountSummary, LedgerRow } from "@/lib/queries";
import { formatDateAR, formatMoney, formatPeriodLabel } from "@/lib/format";
import { Tag } from "@/components/cui";

const FILTER_FIELD =
  "w-full min-h-9 rounded-lg border border-line-strong/60 bg-surface px-2 py-1 text-xs font-normal text-ink hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20";

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
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <h2 className="panel-title">
          <History className="size-4 text-ink-3" aria-hidden="true" />
          Historial de movimientos
          <Tag tone="neutral">
            {filtered.length} de {rows.length}
          </Tag>
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
            className="btn-ghost icon-button-danger min-h-9 px-2.5 text-xs"
          >
            <FilterX className="size-3.5" />
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
              <th className="px-4 py-2.5 text-left font-medium">Concepto</th>
              {accounts.length > 1 && (
                <th className="px-3 py-2.5 text-left font-medium">Cuenta</th>
              )}
              <th className="px-4 py-2.5 text-right font-medium">Entrada</th>
              <th className="px-4 py-2.5 text-right font-medium">Salida</th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
            </tr>
            <tr className="border-t border-line bg-canvas/60">
              <th className="px-3 py-2">
                <select
                  value={colPeriod}
                  onChange={(e) => setColPeriod(e.target.value)}
                  aria-label="Filtrar por período"
                  className={FILTER_FIELD}
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
                  aria-label="Filtrar por concepto"
                  className={`${FILTER_FIELD} min-w-32 placeholder:text-ink-3`}
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
                    aria-label="Filtrar por cuenta"
                    className={FILTER_FIELD}
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
                  aria-label="Filtrar por tipo"
                  className={FILTER_FIELD}
                >
                  <option value="ALL">Entradas y Salidas</option>
                  <option value="IN">Solo Entradas</option>
                  <option value="OUT">Solo Salidas</option>
                </select>
              </th>
              <th></th>
            </tr>
          </thead>

          <tbody className="tabular-nums">
            {filtered.map((row) => {
              const isPos = row.signedAmount > 0;
              const negRun = row.runningBalance < -0.004;
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-3">
                    {formatDateAR(row.date, row.dateUnknown)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{row.concept}</div>
                    {(row.affectsDebt || (row.refAmount && row.refCurrency)) && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {row.affectsDebt && <Tag tone="iris">Préstamo</Tag>}
                        {row.refAmount && row.refCurrency && (
                          <span className="text-xs text-ink-3">
                            Ref: {formatMoney(row.refAmount, row.refCurrency)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  {accounts.length > 1 && (
                    <td className="px-3 py-2.5 text-xs text-ink-2">
                      {row.accountName}
                    </td>
                  )}
                  <td
                    className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${isPos ? "text-success-ink" : "text-ink-3"}`}
                  >
                    {isPos ? formatMoney(row.amount, defaultCurrency) : "—"}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${!isPos ? "text-danger-ink" : "text-ink-3"}`}
                  >
                    {!isPos ? formatMoney(row.amount, defaultCurrency) : "—"}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${negRun ? "text-danger-ink" : "text-ink"}`}
                  >
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
