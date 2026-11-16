import { notFound } from "next/navigation";
import { getPersonDetailBySlug } from "@/lib/queries";
import { PersonLedgerClient } from "@/components/person-ledger-client";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getPersonDetailBySlug(slug);

  if (!detail) {
    notFound();
  }

  return <PersonLedgerClient detail={detail} />;
}
