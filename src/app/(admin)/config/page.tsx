import { asc } from "drizzle-orm";
import { db, services } from "@/db";
import { getPeopleWithBalances } from "@/lib/queries";
import { getPublicNotificationState } from "@/lib/notifications";
import { ConfigClient } from "@/components/config-client";

export default async function ConfigPage() {
  const [people, allServices, notifState] = await Promise.all([
    getPeopleWithBalances(),
    db.query.services.findMany({
      orderBy: [asc(services.sortOrder), asc(services.id)],
      with: { person: true },
    }),
    getPublicNotificationState(),
  ]);

  return (
    <ConfigClient
      people={people}
      services={allServices}
      notificationSettings={notifState.settings}
      notificationDevices={notifState.devices}
    />
  );
}
