import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CalendarDays, Eye, HandCoins, Wallet } from "lucide-react";
import { getDebtBalances, getPersonDetailByShareToken } from "@/lib/queries";
import { VIEWER_PIN_COOKIE_PREFIX, verifyPinToken } from "@/lib/auth";
import { formatMoney, formatPeriodLabel } from "@/lib/format";
import { FamilyPinGate } from "@/components/family-pin-gate";
import { FamilyLedgerTable } from "@/components/family-ledger-table";
import { FontSizeControl } from "@/components/font-size-control";
import { Avatar, PanelHeader, Tag } from "@/components/cui";

export const dynamic = "force-dynamic";

export default async function FamilySharedViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const detail = await getPersonDetailByShareToken(token);

  if (!detail) {
    notFound();
  }

  const { person, accounts, combinedLedger, monthlySummaries, totalBalance } = detail;

  if (person.sharePin && person.sharePin.trim().length > 0) {
    const jar = await cookies();
    const cookieVal = jar.get(`${VIEWER_PIN_COOKIE_PREFIX}${token}`)?.value;
    const unlocked = await verifyPinToken(cookieVal, token);
    if (!unlocked) {
      return <FamilyPinGate personName={person.name} shareToken={token} />;
    }
  }

  const isNegative = totalBalance < -0.004;
  const debtBalances = await getDebtBalances(person.id);

  return (
    <div className="min-h-screen bg-canvas pb-12">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex min-h-14 max-w-4xl items-center justify-between gap-2 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2.5 text-ink">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent text-white shadow-rim">
              <Wallet className="size-4" aria-hidden="true" />
            </span>
            <span className="truncate font-display font-medium tracking-tight">
              <span className="hidden sm:inline">Resumen de cuenta · </span>
              {person.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <FontSizeControl variant="inline" />
            <Tag tone="neutral" icon={Eye} className="hidden sm:inline-flex">
              Solo lectura
            </Tag>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <section className="panel tabular-nums">
          <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
            <Avatar name={person.name} seed={person.id} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-2">
                Saldo actual · {person.defaultCurrency}
              </p>
              <p
                className={`num mt-1 break-words text-3xl font-medium sm:text-4xl ${
                  isNegative ? "text-danger-ink" : "text-ink"
                }`}
              >
                {formatMoney(totalBalance, person.defaultCurrency)}
              </p>
              {isNegative && (
                <Tag tone="danger" className="mt-2">
                  Saldo pendiente a favor de Fer
                </Tag>
              )}
            </div>
          </div>

          {accounts.length > 1 && (
            <div className="grid grid-cols-1 gap-3 rounded-b-surface border-t border-line bg-subtle p-4 sm:grid-cols-3 sm:p-5">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="rounded-panel border border-line bg-surface p-3"
                >
                  <p className="flex items-center gap-1.5 text-xs text-ink-3">
                    <Wallet className="size-3.5" aria-hidden="true" />
                    {acc.name}
                  </p>
                  <p
                    className={`num mt-1 text-lg font-medium ${
                      acc.balance < -0.004 ? "text-danger-ink" : "text-ink"
                    }`}
                  >
                    {formatMoney(acc.balance, acc.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {debtBalances.length > 0 && (
          <section className="panel tabular-nums">
            <PanelHeader
              icon={HandCoins}
              title="Deudas con otras personas"
              description="Préstamos usados para pagar gastos, menos las devoluciones registradas."
            />
            <div className="divide-y divide-line">
              {debtBalances.map((b) => {
                const owes = b.debtor.id === person.id;
                const other = owes ? b.creditor : b.debtor;
                return (
                  <div
                    key={`${b.debtor.id}-${b.creditor.id}-${b.currency}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                  >
                    <span className="flex min-w-0 items-center gap-3 text-sm text-ink-2">
                      <Avatar name={other.name} seed={other.id} size="sm" />
                      {owes
                        ? `Le debés a ${b.creditor.name}`
                        : `${b.debtor.name} te debe`}
                    </span>
                    <span
                      className={`num text-base font-medium ${
                        owes ? "text-danger-ink" : "text-success-ink"
                      }`}
                    >
                      {formatMoney(b.amount, b.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {monthlySummaries.length > 0 && (
          <section className="space-y-3 tabular-nums">
            <h2 className="font-display text-lg font-medium text-ink">
              Servicios y gastos por mes
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {monthlySummaries.slice(0, 6).map((grp) => (
                <div key={grp.period} className="panel">
                  <div className="panel-header">
                    <span className="panel-title">
                      <CalendarDays className="size-4 text-ink-3" aria-hidden="true" />
                      {formatPeriodLabel(grp.period)}
                    </span>
                    <span className="num text-base font-medium text-ink">
                      {formatMoney(grp.total, "ARS")}
                    </span>
                  </div>
                  <div className="divide-y divide-line px-4 sm:px-5">
                    {grp.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex justify-between gap-3 py-2 text-sm"
                      >
                        <span className="text-ink-2">{it.concept}</span>
                        <span className="font-medium text-ink">
                          {formatMoney(it.amount, "ARS")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <FamilyLedgerTable
          rows={combinedLedger}
          accounts={accounts}
          defaultCurrency={person.defaultCurrency}
        />
      </main>
    </div>
  );
}
