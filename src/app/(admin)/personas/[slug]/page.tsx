import { notFound } from "next/navigation";
import {
  getDebtBalances,
  getPeopleWithBalances,
  getPersonDetailBySlug,
} from "@/lib/queries";
import { PersonLedgerClient } from "@/components/person-ledger-client";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [detail, allPeople, debtBalances] = await Promise.all([
    getPersonDetailBySlug(slug),
    getPeopleWithBalances(),
    getDebtBalances(),
  ]);

  if (!detail) {
    notFound();
  }

  const personId = detail.person.id;

  return (
    <PersonLedgerClient
      detail={detail}
      allPeople={allPeople}
      debtBalances={debtBalances.filter(
        (b) => b.debtor.id === personId || b.creditor.id === personId,
      )}
    />
  );
}
