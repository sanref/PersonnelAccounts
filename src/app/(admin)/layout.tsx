import { getPeopleWithBalances } from "@/lib/queries";
import { getPublicNotificationState } from "@/lib/notifications";
import { NavShell } from "@/components/nav-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [allPeople, notifState] = await Promise.all([
    getPeopleWithBalances(),
    getPublicNotificationState(),
  ]);

  const managedLinks = allPeople
    .filter((p) => p.hasManagedAccount)
    .map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <div className="min-h-screen flex flex-col pb-32 lg:pb-8 lg:pl-60">
      <NavShell
        peopleLinks={managedLinks}
        notificationAlerts={notifState.alerts}
        notificationSettings={notifState.settings}
      />
      <main
        id="main-content"
        className="flex-1 min-w-0 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        {children}
      </main>
    </div>
  );
}
