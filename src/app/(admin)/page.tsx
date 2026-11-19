import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Receipt,
  Wallet,
} from "lucide-react";
import { getDebtBalances, getMonthlyPaymentsData } from "@/lib/queries";
import {
  currentPeriodISO,
  formatDateAR,
  formatMoney,
  formatPeriodLabel,
  formatShortPeriodLabel,
} from "@/lib/format";
import { EmptyState } from "@/components/ui-feedback";
import { DebtsPanel } from "@/components/debts-panel";
import {
  Avatar,
  CarryOverTag,
  PanelHeader,
  PendingTag,
  ProgressBar,
  SharedTag,
  Stat,
  Tag,
} from "@/components/cui";

export default async function DashboardPage() {
  const period = currentPeriodISO();
  const [{ people, items, carryOverItems }, debtBalances] = await Promise.all([
    getMonthlyPaymentsData(period),
    getDebtBalances(),
  ]);
  const managedPeople = people.filter((p) => p.hasManagedAccount);
  const pendingBills = [
    ...carryOverItems.map((b) => ({ ...b, isCarryOver: true })),
    ...items
      .filter((i) => i.status === "PENDING")
      .map((b) => ({ ...b, isCarryOver: false })),
  ];
  const unsettledByPerson = managedPeople
    .map((p) => {
      const personItems = items.filter(
        (i) =>
          i.personId === p.id &&
          !i.settledTransactionId &&
          Number(i.amount ?? 0) > 0,
      );
      return {
        person: p,
        count: personItems.length,
        total: personItems.reduce((sum, i) => sum + Number(i.amount ?? 0), 0),
      };
    })
    .filter((summary) => summary.total > 0);
  const monthTotal = items.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
  const monthPaid = items
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
  const monthPending = monthTotal - monthPaid;
  const paidCount = items.filter((i) => i.status === "PAID").length;
  const pendingCount = items.filter((i) => i.status === "PENDING").length;
  const paidPct =
    monthTotal > 0 ? Math.round((monthPaid / monthTotal) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="page-title">Resumen general</h1>
          <p className="text-sm text-ink-2">
            Cuentas y pagos de{" "}
            <span className="tabular-nums">
              {formatPeriodLabel(period).toLowerCase()}
            </span>
            .
          </p>
        </div>
        <Link
          href={`/pagos?periodo=${period}`}
          className="btn-primary self-start sm:self-auto"
        >
          <CalendarDays className="size-4" />
          Gestionar pagos
        </Link>
      </div>

      <section aria-label="Pagos del mes" className="grid gap-4 sm:grid-cols-3">
        <div className="panel">
          <Stat
            label="Gastos del mes"
            icon={Receipt}
            value={formatMoney(monthTotal, "ARS")}
            footer={
              <p className="text-xs text-ink-3 tabular-nums">
                {items.length} conceptos cargados
              </p>
            }
          />
        </div>
        <div className="panel">
          <Stat
            label="Pagado este mes"
            icon={CircleDollarSign}
            value={formatMoney(monthPaid, "ARS")}
            valueClassName="text-success-ink"
            footer={
              <div className="space-y-2">
                <ProgressBar
                  value={monthPaid}
                  max={monthTotal}
                  tone="success"
                  label="Avance de pagos del mes"
                />
                <p className="text-xs text-ink-3 tabular-nums">
                  {paidPct}% del total · {paidCount} pagados
                </p>
              </div>
            }
          />
        </div>
        <div className="panel">
          <Stat
            label="Pendiente este mes"
            icon={Clock3}
            value={formatMoney(monthPending, "ARS")}
            valueClassName={monthPending > 0.004 ? "text-warning-ink" : ""}
            footer={
              <div className="flex flex-wrap items-center gap-2">
                {pendingCount > 0 ? (
                  <PendingTag>{pendingCount} por pagar</PendingTag>
                ) : (
                  <Tag tone="success" icon={CheckCircle2}>
                    Todo pagado
                  </Tag>
                )}
                <span className="text-xs text-ink-3">
                  sin meses anteriores
                </span>
              </div>
            }
          />
        </div>
      </section>

      <section aria-labelledby="accounts-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="accounts-heading"
              className="font-display text-lg font-medium"
            >
              Cuentas administradas
            </h2>
            <p className="mt-0.5 text-sm text-ink-3">
              Elegí una persona para ver su saldo y movimientos.
            </p>
          </div>
          <Link href="/config#personas" className="btn-ghost px-3">
            Administrar personas
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
        {managedPeople.length === 0 ? (
          <div className="panel">
            <EmptyState
              title="Tus cuentas empiezan acá"
              description="Agregá una persona y su primera cuenta para llevar el control de sus movimientos."
              action={
                <Link href="/config#personas" className="btn-primary">
                  Agregar persona
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {managedPeople.map((p) => {
              const negative = p.totalBalance < -0.004;
              return (
                <Link
                  key={p.id}
                  href={`/personas/${p.slug}`}
                  className="panel group flex min-w-0 flex-col transition-[border-color,scale] duration-140 hover:border-line-strong/60 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3 p-4 sm:p-5">
                    <Avatar name={p.name} seed={p.id} size="md" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-medium">
                        {p.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-ink-3">
                        {p.accounts.length}{" "}
                        {p.accounts.length === 1 ? "cuenta" : "cuentas"} ·{" "}
                        {p.defaultCurrency}
                      </p>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-accent" />
                  </div>
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                    <p className="text-xs text-ink-3">Saldo disponible</p>
                    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                      <p
                        className={`num break-words text-[1.75rem] font-medium leading-tight ${negative ? "text-danger-ink" : ""}`}
                      >
                        {formatMoney(p.totalBalance, p.defaultCurrency)}
                      </p>
                      {negative && <Tag tone="danger">Saldo a tu favor</Tag>}
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 rounded-b-surface border-t border-line bg-subtle px-4 py-2.5 text-xs text-ink-2 sm:px-5">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Wallet className="size-3.5 shrink-0 text-ink-3" />
                      <span className="truncate">
                        {p.accounts.map((a) => a.name).join(" · ") ||
                          "Sin subcuentas"}
                      </span>
                    </span>
                    {p.shareEnabled && <SharedTag />}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="pending-heading" className="panel min-w-0">
          <PanelHeader
            id="pending-heading"
            icon={Clock3}
            title={
              <>
                Pendientes de pago
                {pendingBills.length > 0 && (
                  <Tag tone="warning">{pendingBills.length}</Tag>
                )}
              </>
            }
            description="Del mes y de períodos anteriores."
            action={
              <Link
                href={`/pagos?periodo=${period}`}
                className="btn-ghost min-h-9 px-2.5"
              >
                Ver todos
                <ArrowRight className="size-4" />
              </Link>
            }
          />
          {pendingBills.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-full border border-success-line bg-success-soft text-success">
                <CheckCircle2 className="size-5" />
              </span>
              <p className="text-sm font-medium">
                No tenés pagos pendientes cargados
              </p>
              <Link href={`/pagos?periodo=${period}`} className="btn-secondary">
                Revisar gastos del mes
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {pendingBills.slice(0, 8).map((bill) => (
                <Link
                  key={bill.id}
                  href={`/pagos?periodo=${bill.period}&persona=${bill.personId}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-100 last:rounded-b-surface hover:bg-subtle sm:px-5"
                >
                  <Avatar
                    name={bill.person.name}
                    seed={bill.personId}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">
                      {bill.concept}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                      <span>{bill.person.name}</span>
                      {bill.isCarryOver && (
                        <CarryOverTag>
                          De {formatShortPeriodLabel(bill.period)}
                        </CarryOverTag>
                      )}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <p
                      className={`text-sm font-medium ${bill.amount === null ? "text-ink-3" : ""}`}
                    >
                      {bill.amount !== null
                        ? formatMoney(bill.amount, "ARS")
                        : "Sin importe"}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {bill.dueDate
                        ? `Vence ${formatDateAR(bill.dueDate)}`
                        : "Sin vencimiento"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section aria-labelledby="settlement-heading" className="panel">
            <PanelHeader
              id="settlement-heading"
              icon={Wallet}
              title="Por descontar en cuenta"
              description={`Gastos de ${formatPeriodLabel(period).toLowerCase()} sin egreso registrado.`}
            />
            {unsettledByPerson.length === 0 ? (
              <p className="m-4 rounded-control bg-subtle p-3 text-sm text-ink-2">
                No hay gastos con importe pendientes de descontar.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {unsettledByPerson.map(({ person, count, total }) => (
                  <Link
                    key={person.id}
                    href={`/pagos?periodo=${period}&tab=resumen&persona=${person.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors duration-100 last:rounded-b-surface hover:bg-subtle sm:px-5"
                  >
                    <Avatar name={person.name} seed={person.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {person.name}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-3 tabular-nums">
                        {count} {count === 1 ? "concepto" : "conceptos"}
                      </p>
                    </div>
                    <span className="text-right text-sm font-medium tabular-nums">
                      {formatMoney(total, "ARS")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <DebtsPanel balances={debtBalances} people={people} />
        </div>
      </div>
    </div>
  );
}
