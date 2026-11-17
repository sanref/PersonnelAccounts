import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Share2,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import { getMonthlyPaymentsData } from "@/lib/queries";
import {
  currentPeriodISO,
  formatDateAR,
  formatMoney,
  formatPeriodLabel,
  formatShortPeriodLabel,
} from "@/lib/format";
import { EmptyState } from "@/components/ui-feedback";

export default async function DashboardPage() {
  const period = currentPeriodISO();
  const { people, items, carryOverItems } =
    await getMonthlyPaymentsData(period);
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="eyebrow">Tu administración, en orden</p>
          <h1 className="page-title">Resumen general</h1>
          <p className="text-sm text-slate-500">
            Tus cuentas y pagos de{" "}
            <span className="tabular-nums">
              {formatPeriodLabel(period).toLowerCase()}
            </span>
            .
          </p>
        </div>
        <Link
          href={`/pagos?periodo=${period}`}
          className="btn-primary self-start"
        >
          <CalendarDays className="size-4" />
          Gestionar pagos
        </Link>
      </div>

      <section
        aria-label="Pagos del mes"
        className="panel grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        {[
          {
            label: "Gastos del mes",
            amount: monthTotal,
            hint: `${items.length} conceptos · ARS`,
          },
          {
            label: "Pagado este mes",
            amount: monthPaid,
            hint: "Pagos registrados · ARS",
          },
          {
            label: "Pendiente este mes",
            amount: monthTotal - monthPaid,
            hint: "Sin incluir meses anteriores · ARS",
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:block sm:p-6"
          >
            <p className="text-xs font-medium text-slate-500">{metric.label}</p>
            <p className="break-words text-right text-lg font-semibold tracking-tight tabular-nums sm:mt-2 sm:text-left sm:text-2xl">
              {formatMoney(metric.amount, "ARS")}
            </p>
            <p className="hidden text-xs text-slate-500 tabular-nums sm:mt-1 sm:block">
              {metric.hint}
            </p>
          </div>
        ))}
      </section>

      <section aria-labelledby="accounts-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="accounts-heading" className="text-base font-medium">
              Cuentas administradas
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Elegí una persona para ver su saldo y movimientos.
            </p>
          </div>
          <Link href="/config#personas" className="btn-ghost px-2 text-xs">
            Administrar personas
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
        {managedPeople.length === 0 ? (
          <div className="panel">
            <EmptyState
              title="Tus cuentas empiezan acá"
              description="Agregá una persona y su primera cuenta para llevar el control de sus movimientos."
              action={
                <Link href="/config#personas" className="btn-secondary">
                  Agregar persona
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {managedPeople.map((p) => (
              <Link
                key={p.id}
                href={`/personas/${p.slug}`}
                className="panel group flex min-w-0 flex-col justify-between gap-5 p-4 transition-colors hover:border-slate-400 sm:p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium">
                    {p.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">{p.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {p.defaultCurrency} · {p.accounts.length}{" "}
                      {p.accounts.length === 1 ? "cuenta" : "cuentas"}
                    </p>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0 text-slate-400 group-hover:text-slate-900" />
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Saldo disponible</p>
                  <p className="mt-1 break-words text-2xl font-semibold tracking-tight tabular-nums">
                    {formatMoney(p.totalBalance, p.defaultCurrency)}
                  </p>
                  {p.totalBalance < -0.004 && (
                    <span className="mt-2 inline-block rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-800">
                      Saldo a tu favor
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Wallet className="size-3 shrink-0" />
                    <span className="truncate">
                      {p.accounts.map((a) => a.name).join(" · ") ||
                        "Sin subcuentas"}
                    </span>
                  </span>
                  {p.shareEnabled && (
                    <span className="inline-flex items-center gap-1">
                      <Share2 className="size-3" />
                      Compartido
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="pending-heading"
          className="panel min-w-0 overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-6">
            <div>
              <h2 id="pending-heading" className="text-base font-medium">
                Pendientes de pago
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Del mes y de períodos anteriores.
              </p>
            </div>
            <Link
              href={`/pagos?periodo=${period}`}
              className="btn-ghost px-2 text-xs"
            >
              Ver todos ({pendingBills.length})<ArrowRight className="size-3" />
            </Link>
          </div>
          {pendingBills.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <CheckCircle2 className="size-8 text-slate-400" />
              <p className="text-sm font-medium">
                No tenés pagos pendientes cargados
              </p>
              <Link
                href={`/pagos?periodo=${period}`}
                className="btn-secondary text-xs"
              >
                Revisar gastos del mes
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingBills.slice(0, 8).map((bill) => (
                <Link
                  key={bill.id}
                  href={`/pagos?periodo=${bill.period}&persona=${bill.personId}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50 sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">
                      {bill.concept}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {bill.person.name}
                      {bill.isCarryOver && (
                        <span className="ml-2 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                          Pendiente de {formatShortPeriodLabel(bill.period)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-sm font-medium">
                      {bill.amount !== null
                        ? formatMoney(bill.amount, "ARS")
                        : "Sin importe"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {bill.dueDate
                        ? formatDateAR(bill.dueDate)
                        : "Sin vencimiento"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section
          aria-labelledby="settlement-heading"
          className="panel p-4 sm:p-6"
        >
          <span className="mb-4 inline-flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Wallet className="size-4" />
          </span>
          <h2 id="settlement-heading" className="text-base font-medium">
            Por descontar en cuenta
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Gastos de {formatPeriodLabel(period).toLowerCase()} que todavía no
            se registraron como egreso. No es lo mismo que un pago pendiente.
          </p>
          <div className="mt-4 divide-y divide-slate-100">
            {unsettledByPerson.map(({ person, count, total }) => (
              <Link
                key={person.id}
                href={`/pagos?periodo=${period}&tab=resumen&persona=${person.id}`}
                className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium">{person.name}</p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {count} conceptos
                  </p>
                </div>
                <span className="text-right text-sm font-medium tabular-nums">
                  {formatMoney(total, "ARS")}
                </span>
              </Link>
            ))}
          </div>
          {unsettledByPerson.length === 0 && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              No hay gastos con importe pendientes de descontar.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
