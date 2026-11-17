import { getMonthlyPaymentsData } from "@/lib/queries";
import { currentPeriodISO } from "@/lib/format";
import { MonthlyPaymentsClient } from "@/components/monthly-payments-client";

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string;
    period?: string;
    tab?: string;
    persona?: string;
  }>;
}) {
  const sp = await searchParams;
  const rawPeriod = sp.periodo ?? sp.period;
  const period =
    rawPeriod && /^\d{4}-\d{2}$/.test(rawPeriod)
      ? rawPeriod
      : currentPeriodISO();

  const data = await getMonthlyPaymentsData(period);

  return (
    <MonthlyPaymentsClient
      key={`${period}-${sp.persona ?? "ALL"}-${sp.tab ?? "grilla"}`}
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
