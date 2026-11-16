import { getPeopleWithBalances } from "@/lib/queries";
import { NavShell } from "@/components/nav-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const allPeople = await getPeopleWithBalances();
  const managedLinks = allPeople
    .filter((p) => p.hasManagedAccount)
    .map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-8">
      <NavShell peopleLinks={managedLinks} />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
