import { asc } from "drizzle-orm";
import { db, services } from "@/db";
import { getPeopleWithBalances } from "@/lib/queries";
import { ConfigClient } from "@/components/config-client";

export default async function ConfigPage() {
  const [people, allServices] = await Promise.all([
    getPeopleWithBalances(),
    db.query.services.findMany({
      orderBy: [asc(services.sortOrder), asc(services.id)],
      with: { person: true },
    }),
  ]);

  return <ConfigClient people={people} services={allServices} />;
}
