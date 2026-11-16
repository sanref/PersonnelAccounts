import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { getPersonDetailByShareToken } from "@/lib/queries";
import { VIEWER_PIN_COOKIE_PREFIX, verifyPinToken } from "@/lib/auth";
import { formatMoney, formatPeriodLabel } from "@/lib/format";
import { FamilyPinGate } from "@/components/family-pin-gate";
import { FamilyLedgerTable } from "@/components/family-ledger-table";
import { FontSizeControl } from "@/components/font-size-control";

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

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 min-h-14 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 min-w-0">
            <span className="w-7 h-7 shrink-0 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </span>
            <span className="truncate">
              <span className="hidden sm:inline">Resumen de Cuenta · </span>
              {person.name}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <FontSizeControl variant="inline" />
            <span className="hidden sm:inline-block text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
              Solo lectura
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 tabular-nums">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Saldo actual ({person.defaultCurrency})
            </p>
            <p
              className={`text-3xl sm:text-4xl font-bold mt-1 ${
                isNegative ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {formatMoney(totalBalance, person.defaultCurrency)}
            </p>
            {isNegative && (
              <p className="text-xs text-rose-600 mt-1 font-medium">
                Saldo pendiente a favor de Fer
              </p>
            )}
          </div>

          {accounts.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
              {accounts.map((acc) => (
                <div key={acc.id} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 font-medium">{acc.name}</p>
                  <p className="text-base font-bold text-slate-900 mt-0.5">
                    {formatMoney(acc.balance, acc.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {monthlySummaries.length > 0 && (
          <section className="space-y-3 tabular-nums">
            <h2 className="text-base font-bold text-slate-900">
              Detalle de Servicios y Gastos por Mes
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {monthlySummaries.slice(0, 6).map((grp) => (
                <div
                  key={grp.period}
                  className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-900 text-sm">
                      {formatPeriodLabel(grp.period)}
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatMoney(grp.total, "ARS")}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    {grp.items.map((it) => (
                      <div key={it.id} className="flex justify-between">
                        <span>{it.concept}</span>
                        <span className="font-medium text-slate-800">
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
