"use client";

import {
  ArrowDownToLine,
  CheckCircle2,
  Circle,
  FileClock,
  Trash2,
} from "lucide-react";
import type { MonthlyItemRow } from "@/components/monthly-payments-client";
import { formatShortPeriodLabel, shiftPeriod } from "@/lib/format";
import { InlineMoneyCell } from "@/components/ui-controls";
import { Avatar, CarryOverTag, SettledTag, Tag } from "@/components/cui";

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
    <article
      className={`space-y-3 p-4 ${item.isCarryOver ? "bg-orange-soft/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={item.person.name} seed={item.personId} size="sm" />
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-ink-3">{item.person.name}</p>
            <h3 className="break-words text-sm font-medium text-ink">
              {item.concept}
            </h3>
            <div className="flex flex-wrap gap-1">
              {item.isCarryOver && (
                <CarryOverTag>
                  Pendiente de {formatShortPeriodLabel(item.period)}
                </CarryOverTag>
              )}
              {isArrears && (
                <Tag tone="neutral" icon={FileClock}>
                  Factura de {formatShortPeriodLabel(billedPeriod)}
                </Tag>
              )}
              {item.kind === "EXTRA" && <Tag tone="iris">Extra</Tag>}
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="icon-button icon-button-danger -mr-2"
          aria-label={`Quitar ${item.concept}`}
          title={`Quitar ${item.concept}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="min-w-0 text-xs text-ink-3">
          Vencimiento
          <input
            key={item.dueDate ?? "sin-fecha"}
            type="date"
            disabled={busy}
            defaultValue={item.dueDate ?? ""}
            onBlur={(e) => onDate(e.target.value)}
            className="field mt-1 block px-2 text-right tabular-nums"
          />
        </label>
        <div className="min-w-0 text-right">
          <p className="text-xs text-ink-3">Importe</p>
          <InlineMoneyCell
            disabled={busy}
            label={`Importe de ${item.concept}`}
            amount={item.amount}
            onSave={onAmount}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={onTogglePaid}
          aria-label={`${paid ? "Marcar pendiente" : "Marcar pagado"}: ${item.concept}`}
          className={`inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors active:scale-[0.97] ${paid ? "border-success-line bg-success-soft text-success-ink hover:border-success" : "border-warning-line bg-warning-soft text-warning-ink hover:border-warning"}`}
        >
          {paid ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Circle className="size-4" />
          )}
          {paid ? "Pagado" : "Pendiente"}
        </button>
        {item.settledTransactionId ? (
          <SettledTag>
            Descontado
            {item.settledTransaction?.account.name
              ? ` · ${item.settledTransaction.account.name}`
              : ""}
          </SettledTag>
        ) : canSettle ? (
          <button
            type="button"
            disabled={busy}
            onClick={onSettle}
            className="btn-secondary px-3"
          >
            <ArrowDownToLine className="size-4" />
            Descontar en cuenta
          </button>
        ) : null}
      </div>
      {item.notes && (
        <p className="break-words rounded-control bg-subtle px-3 py-2 text-xs text-ink-2">
          {item.notes}
        </p>
      )}
    </article>
  );
}
