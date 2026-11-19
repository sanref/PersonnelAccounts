"use client";

import { useState, useTransition } from "react";
import { HandCoins, Undo2, X } from "lucide-react";
import type { DebtBalance, PersonCardSummary } from "@/lib/queries";
import { createTransactionAction } from "@/app/actions";
import {
  formatMoney,
  formatNumberAR,
  parseMoneyInput,
  todayISO,
} from "@/lib/format";
import { MoneyInput } from "@/components/ui-controls";
import { EmptyState, FeedbackBanner } from "@/components/ui-feedback";
import { Modal } from "@/components/modal";
import { Avatar, PanelHeader, Tag } from "@/components/cui";

function repayAccounts(
  people: PersonCardSummary[],
  personId: number,
  currency: string,
) {
  return (
    people
      .find((p) => p.id === personId)
      ?.accounts.filter((a) => a.isActive && a.currency === currency) ?? []
  );
}

/**
 * Saldos de deuda entre personas (préstamos/devoluciones marcados) con acción para
 * registrar una devolución total o parcial como transferencia entre sus cuentas.
 */
export function DebtsPanel({
  balances,
  people,
  personId,
  className = "",
}: {
  balances: DebtBalance[];
  people: PersonCardSummary[];
  /** Si viene, redacta cada saldo desde el punto de vista de esa persona. */
  personId?: number;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [repaying, setRepaying] = useState<DebtBalance | null>(null);
  const [fromAccountId, setFromAccountId] = useState(0);
  const [toAccountId, setToAccountId] = useState(0);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [concept, setConcept] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function describe(b: DebtBalance) {
    if (personId === b.debtor.id) return `Le debe a ${b.creditor.name}`;
    if (personId === b.creditor.id) return `${b.debtor.name} le debe`;
    return `${b.debtor.name} le debe a ${b.creditor.name}`;
  }

  function openRepay(b: DebtBalance) {
    setRepaying(b);
    setFromAccountId(repayAccounts(people, b.debtor.id, b.currency)[0]?.id ?? 0);
    setToAccountId(repayAccounts(people, b.creditor.id, b.currency)[0]?.id ?? 0);
    setAmount(formatNumberAR(b.amount, 2));
    setDate(todayISO());
    setConcept(`Devolución a ${b.creditor.name}`);
    setFormError(null);
    setFeedback(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repaying) return;
    const parsed = parseMoneyInput(amount);
    if (parsed === null || parsed <= 0) {
      setFormError("Ingresá un monto válido mayor a 0");
      return;
    }
    if (parsed > repaying.amount + 0.004) {
      setFormError(
        `El monto supera la deuda (${formatMoney(repaying.amount, repaying.currency)})`,
      );
      return;
    }
    if (!fromAccountId || !toAccountId) {
      setFormError("Elegí las cuentas de origen y destino");
      return;
    }
    const b = repaying;
    startTransition(async () => {
      setFormError(null);
      try {
        await createTransactionAction({
          type: "TRANSFER",
          accountId: fromAccountId,
          toAccountId,
          date,
          amount: parsed,
          concept,
          affectsDebt: true,
        });
        setRepaying(null);
        setFeedback(
          `${b.debtor.name} le devolvió ${formatMoney(parsed, b.currency)} a ${b.creditor.name}.`,
        );
      } catch (err) {
        setFormError(
          err instanceof Error ? err.message : "No se pudo registrar la devolución",
        );
      }
    });
  }

  const fromOptions = repaying
    ? repayAccounts(people, repaying.debtor.id, repaying.currency)
    : [];
  const toOptions = repaying
    ? repayAccounts(people, repaying.creditor.id, repaying.currency)
    : [];

  return (
    <section aria-labelledby="debts-heading" className={`panel ${className}`}>
      <PanelHeader
        id="debts-heading"
        icon={HandCoins}
        title={
          <>
            Deudas entre personas
            {balances.length > 0 && <Tag tone="iris">{balances.length}</Tag>}
          </>
        }
        description="Préstamos entre personas, netos de devoluciones."
      />

      {feedback && (
        <div className="px-4 pt-4 sm:px-5">
          <FeedbackBanner message={feedback} onDismiss={() => setFeedback(null)} />
        </div>
      )}

      {balances.length === 0 ? (
        <EmptyState
          title="Sin deudas pendientes"
          description="Cuando pagues un gasto con dinero de otra persona, la deuda aparece acá."
        />
      ) : (
        <div className="divide-y divide-line">
          {balances.map((b) => {
            const canRepay =
              repayAccounts(people, b.debtor.id, b.currency).length > 0 &&
              repayAccounts(people, b.creditor.id, b.currency).length > 0;
            return (
              <div
                key={`${b.debtor.id}-${b.creditor.id}-${b.currency}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex -space-x-2">
                    <Avatar name={b.debtor.name} seed={b.debtor.id} size="sm" className="ring-2 ring-surface" />
                    <Avatar name={b.creditor.name} seed={b.creditor.id} size="sm" className="ring-2 ring-surface" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">{describe(b)}</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums text-iris-ink">
                      {formatMoney(b.amount, b.currency)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canRepay || isPending}
                  onClick={() => openRepay(b)}
                  title={
                    canRepay
                      ? `Registrar devolución de ${b.debtor.name} a ${b.creditor.name}`
                      : `Faltan cuentas activas en ${b.currency} para registrar la devolución`
                  }
                  className="btn-secondary min-h-10 px-3"
                >
                  <Undo2 className="size-3.5" />
                  Registrar devolución
                </button>
              </div>
            );
          })}
        </div>
      )}

      {repaying && (
        <Modal
          labelledBy="repay-title"
          onClose={() => setRepaying(null)}
          busy={isPending}
        >
          <form onSubmit={handleSubmit} className="p-4 sm:p-6">
            <fieldset disabled={isPending} className="min-w-0 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3
                  id="repay-title"
                  className="min-w-0 break-words font-display text-lg font-medium text-ink"
                >
                  Devolución de {repaying.debtor.name} a {repaying.creditor.name}
                </h3>
                <button
                  type="button"
                  aria-label="Cerrar devolución"
                  onClick={() => setRepaying(null)}
                  className="icon-button -mr-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && <FeedbackBanner message={formError} error />}

              <div className="flex items-baseline justify-between gap-3 rounded-panel border border-iris-line bg-iris-soft px-3 py-2">
                <span className="text-xs text-iris-ink">Deuda actual</span>
                <span className="num text-base font-medium text-iris-ink">
                  {formatMoney(repaying.amount, repaying.currency)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="repay-from" className="field-label">
                    Sale de ({repaying.debtor.name})
                  </label>
                  <select
                    id="repay-from"
                    value={fromAccountId}
                    onChange={(e) => setFromAccountId(Number(e.target.value))}
                    className="field"
                  >
                    {fromOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} (saldo {formatMoney(a.balance, a.currency)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="repay-to" className="field-label">
                    Entra en ({repaying.creditor.name})
                  </label>
                  <select
                    id="repay-to"
                    value={toAccountId}
                    onChange={(e) => setToAccountId(Number(e.target.value))}
                    className="field"
                  >
                    {toOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} (saldo {formatMoney(a.balance, a.currency)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="repay-amount" className="field-label">
                    Monto
                  </label>
                  <MoneyInput
                    id="repay-amount"
                    value={amount}
                    onChange={setAmount}
                    currency={repaying.currency}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="repay-date" className="field-label">
                    Fecha
                  </label>
                  <input
                    id="repay-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="field"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="repay-concept" className="field-label">
                  Concepto
                </label>
                <input
                  id="repay-concept"
                  type="text"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  required
                  className="field"
                />
              </div>

              <p className="text-xs text-ink-3">
                Se registra como transferencia entre las dos cuentas y descuenta de la
                deuda. Podés devolver una parte.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRepaying(null)}
                  className="btn-ghost"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {isPending ? "Guardando…" : "Registrar devolución"}
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </section>
  );
}
