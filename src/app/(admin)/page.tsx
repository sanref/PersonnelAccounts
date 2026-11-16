import Link from "next/link";
import {
  ArrowRight,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Share2,
  Wallet,
} from "lucide-react";
import { getMonthlyPaymentsData } from "@/lib/queries";
import {
  currentPeriodISO,
  formatDateAR,
  formatMoney,
  formatPeriodLabel,
  formatShortPeriodLabel,
} from "@/lib/format";

export default async function DashboardPage() {
  const period = currentPeriodISO();
  const { people, items, carryOverItems } = await getMonthlyPaymentsData(period);

  const managedPeople = people.filter((p) => p.hasManagedAccount);
  const pendingBills = [
    ...carryOverItems.map((b) => ({ ...b, isCarryOver: true })),
    ...items.filter((i) => i.status === "PENDING").map((b) => ({ ...b, isCarryOver: false })),
  ];

  const unsettledByPerson = managedPeople
    .map((p) => {
      const personItems = items.filter(
        (i) => i.personId === p.id && !i.settledTransactionId && Number(i.amount ?? 0) > 0
      );
      const sum = personItems.reduce((acc, i) => acc + Number(i.amount ?? 0), 0);
      return { person: p, count: personItems.length, total: Math.round(sum * 100) / 100 };
    })
    .filter((x) => x.total > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Resumen General</h1>
          <p className="text-sm text-slate-500">
            Saldos al día de cuentas administradas y vencimientos de{" "}
            <span className="font-medium text-slate-700">{formatPeriodLabel(period)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/pagos?periodo=${period}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
          >
            <CalendarClock className="w-4 h-4" />
            Ir a Pagos del Mes
          </Link>
        </div>
      </div>

      {/* Tarjetas de Personas Administradas */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 tabular-nums">
          {managedPeople.map((p) => {
            const isNegative = p.totalBalance < -0.004;
            return (
              <Link
                key={p.id}
                href={`/personas/${p.slug}`}
                className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-400 hover:shadow-sm transition flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{p.name}</h2>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {p.defaultCurrency}
                      </span>
                      {p.shareEnabled && (
                        <span
                          title="Acceso familiar habilitado"
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"
                        >
                          <Share2 className="w-3 h-3" />
                          Compartido
                        </span>
                      )}
                    </div>
                    {p.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{p.notes}</p>
                    )}
                  </div>

                  <span className="p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition">
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                    Saldo disponible
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold tracking-tight mt-0.5 ${
                      isNegative ? "text-rose-600" : "text-slate-900"
                    }`}
                  >
                    {formatMoney(p.totalBalance, p.defaultCurrency)}
                  </p>
                  {isNegative && (
                    <p className="text-xs text-rose-600 mt-1 font-medium">
                      Saldo a tu favor (te debe)
                    </p>
                  )}
                </div>

                {p.accounts.length > 1 ? (
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2">
                    {p.accounts.map((acc) => (
                      <div key={acc.id} className="bg-slate-50 rounded-xl px-3 py-2">
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          {acc.name}
                        </p>
                        <p className="text-xs sm:text-sm font-semibold text-slate-800 mt-0.5">
                          {formatMoney(acc.balance, acc.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-slate-400" />
                      Cuenta {p.accounts[0]?.name ?? "Principal"}
                    </span>
                    <span>{p.accounts[0]?.txCount ?? 0} movimientos</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Avisos de Resúmenes Mensuales listos para descontar */}
      {unsettledByPerson.length > 0 && (
        <section className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 sm:p-5 tabular-nums">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <h3 className="text-sm font-semibold text-amber-950">
                Resúmenes de {formatPeriodLabel(period)} pendientes de descontar en cuenta
              </h3>
              <div className="flex flex-wrap gap-3">
                {unsettledByPerson.map(({ person, count, total }) => (
                  <Link
                    key={person.id}
                    href={`/pagos?periodo=${period}&tab=resumen&persona=${person.id}`}
                    className="inline-flex items-center gap-2 bg-white border border-amber-300 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 hover:border-amber-500 transition"
                  >
                    <span className="font-bold">{person.name}:</span>
                    <span>
                      {formatMoney(total, person.defaultCurrency)} ({count} ítems)
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Vencimientos pendientes del mes actual + arrastrados */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 tabular-nums">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Pendientes de pago · {formatPeriodLabel(period)}
            </h2>
            <p className="text-xs text-slate-500">
              Incluye servicios pendientes del mes e impagos de meses anteriores
            </p>
          </div>
          <Link
            href={`/pagos?periodo=${period}`}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4"
          >
            Ver todos ({items.length})
          </Link>
        </div>

        {pendingBills.length === 0 ? (
          <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            <p className="text-sm font-medium text-slate-700">
              No tenés servicios pendientes cargados para {formatPeriodLabel(period)}.
            </p>
            <Link
              href={`/pagos?periodo=${period}`}
              className="text-xs text-slate-600 underline"
            >
              Revisar o iniciar servicios del mes
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingBills.slice(0, 10).map((b) => (
              <div
                key={`${b.isCarryOver ? "co" : "cur"}-${b.id}`}
                className="py-2.5 flex items-center justify-between gap-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium shrink-0">
                    {b.person.name}
                  </span>
                  <span className="font-medium text-slate-800 truncate">{b.concept}</span>
                  {b.isCarryOver && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                      Impago {formatShortPeriodLabel(b.period)}
                    </span>
                  )}
                  {b.billedPeriod && b.billedPeriod !== b.period && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                      Período {formatShortPeriodLabel(b.billedPeriod)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-slate-500">
                    {b.dueDate ? `Vence ${formatDateAR(b.dueDate)}` : "Sin vencimiento"}
                  </span>
                  <span className="font-semibold text-slate-900 min-w-28 text-right">
                    {b.amount ? formatMoney(b.amount, "ARS") : "Sin importe"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
