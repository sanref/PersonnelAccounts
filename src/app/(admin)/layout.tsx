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
    .map((p) => ({ id: p.id, slug: p.slug, name: p.name }));

  return (
    <div className="min-h-screen flex flex-col pb-32 md:pb-8">
      <NavShell
        peopleLinks={managedLinks}
        notificationAlerts={notifState.alerts}
        notificationSettings={notifState.settings}
      />
      <main
        id="main-content"
        className="flex-1 min-w-0 w-full lg:pl-64"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:pb-8 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
}
