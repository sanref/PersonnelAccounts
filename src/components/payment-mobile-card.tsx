"use client";

import { ArrowDownToLine, CheckCircle2, Circle, Trash2 } from "lucide-react";
import type { MonthlyItemRow } from "@/components/monthly-payments-client";
import { formatShortPeriodLabel, shiftPeriod } from "@/lib/format";
import { InlineMoneyCell } from "@/components/ui-controls";

export function PaymentMobileCard({
  item,
  busy,
  canSettle,
  onTogglePaid,
  onAmount,
  onDate,
  onSettle,
  onDelete,
}: {
  item: MonthlyItemRow & { isCarryOver: boolean };
  busy: boolean;
  canSettle: boolean;
  onTogglePaid: () => void;
  onAmount: (amount: number | null) => void;
  onDate: (date: string) => void;
  onSettle: () => void;
  onDelete: () => void;
}) {
  const paid = item.status === "PAID";
  const isArrears =
    Boolean(item.billedPeriod && item.billedPeriod !== item.period) ||
    Boolean(item.service?.paysInArrears);
  const billedPeriod =
    item.billedPeriod ||
    (item.service?.paysInArrears ? shiftPeriod(item.period, -1) : item.period);
  return (
    <article className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-slate-600">{item.person.name}</p>
          <h3 className="break-words text-sm font-medium text-slate-900">
            {item.concept}
          </h3>
          <div className="flex flex-wrap gap-1 text-xs">
            {item.isCarryOver && (
              <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                Pendiente de {formatShortPeriodLabel(item.period)}
              </span>
            )}
            {isArrears && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">
                Factura de {formatShortPeriodLabel(billedPeriod)}
              </span>
            )}
            {item.kind === "EXTRA" && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">
                Extra
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="icon-button -mr-2 hover:bg-rose-50 hover:text-rose-700"
          aria-label={`Quitar ${item.concept}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="min-w-0 text-xs text-slate-600">
          Vencimiento
          <input
            key={item.dueDate ?? "sin-fecha"}
            type="date"
            disabled={busy}
            defaultValue={item.dueDate ?? ""}
            onBlur={(e) => onDate(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-right text-sm tabular-nums text-slate-700"
          />
        </label>
        <div className="min-w-0 text-right">
          <p className="text-xs text-slate-600">Importe</p>
          <InlineMoneyCell
            disabled={busy}
            label={`Importe de ${item.concept}`}
            amount={item.amount}
            onSave={onAmount}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={onTogglePaid}
          aria-label={`${paid ? "Marcar pendiente" : "Marcar pagado"}: ${item.concept}`}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium ${paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
        >
          {paid ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Circle className="size-4" />
          )}
          {paid ? "Pagado" : "Pendiente"}
        </button>
        {item.settledTransactionId ? (
          <span className="text-right text-xs text-slate-600">
            Descontado
            {item.settledTransaction?.account.name
              ? ` · ${item.settledTransaction.account.name}`
              : ""}
          </span>
        ) : canSettle ? (
          <button
            type="button"
            disabled={busy}
            onClick={onSettle}
            className="btn-secondary text-xs"
          >
            <ArrowDownToLine className="size-4" />
            Descontar en cuenta
          </button>
        ) : null}
      </div>
      {item.notes && (
        <p className="break-words text-xs text-slate-600">{item.notes}</p>
      )}
    </article>
  );
}
