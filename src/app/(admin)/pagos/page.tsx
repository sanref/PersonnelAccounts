import { getMonthlyPaymentsData } from "@/lib/queries";
import { currentPeriodISO } from "@/lib/format";
import { MonthlyPaymentsClient } from "@/components/monthly-payments-client";

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; tab?: string; persona?: string }>;
}) {
  const sp = await searchParams;
  const period =
    sp.periodo && /^\d{4}-\d{2}$/.test(sp.periodo)
      ? sp.periodo
      : currentPeriodISO();

  const data = await getMonthlyPaymentsData(period);

  return (
    <MonthlyPaymentsClient
      period={period}
      people={data.people}
      items={data.items}
      carryOverItems={data.carryOverItems}
      missingServicesCount={data.missingServicesCount}
      initialTab={sp.tab === "resumen" ? "resumen" : "grilla"}
      initialPersonFilter={sp.persona ? Number(sp.persona) : "ALL"}
    />
  );
}
