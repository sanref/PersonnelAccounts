import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db, people, accounts, transactions, services, monthlyItems } from "@/db";

export interface AccountSummary {
  id: number;
  personId: number;
  name: string;
  currency: string;
  initialBalance: number;
  balance: number;
  txCount: number;
  isActive: boolean;
}

export interface PersonCardSummary {
  id: number;
  name: string;
  slug: string;
  defaultCurrency: string;
  isOwn: boolean;
  hasManagedAccount: boolean;
  shareToken: string | null;
  sharePin: string | null;
  shareEnabled: boolean;
  notes: string | null;
  totalBalance: number;
  accounts: AccountSummary[];
}

export function computeSignedDelta(type: string, amount: number): number {
  if (type === "IN" || type === "YIELD" || type === "TRANSFER_IN") {
    return amount;
  }
  return -amount;
}

export async function getPeopleWithBalances(): Promise<PersonCardSummary[]> {
  const allPeople = await db.query.people.findMany({
    orderBy: [asc(people.sortOrder), asc(people.id)],
    with: {
      accounts: {
        orderBy: [asc(accounts.sortOrder), asc(accounts.id)],
        with: {
          transactions: true,
        },
      },
    },
  });

  return allPeople.map((p) => {
    const accSummaries: AccountSummary[] = p.accounts.map((a) => {
      let bal = Number(a.initialBalance);
      for (const tx of a.transactions) {
        bal += computeSignedDelta(tx.type, Number(tx.amount));
      }
      return {
        id: a.id,
        personId: a.personId,
        name: a.name,
        currency: a.currency,
        initialBalance: Number(a.initialBalance),
        balance: Math.round(bal * 100) / 100,
        txCount: a.transactions.length,
        isActive: a.isActive,
      };
    });

    const totalBalance =
      Math.round(
        accSummaries
          .filter((a) => a.currency === p.defaultCurrency)
          .reduce((acc, a) => acc + a.balance, 0) * 100
      ) / 100;

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      defaultCurrency: p.defaultCurrency,
      isOwn: p.isOwn,
      hasManagedAccount: p.hasManagedAccount,
      shareToken: p.shareToken,
      sharePin: p.sharePin,
      shareEnabled: p.shareEnabled,
      notes: p.notes,
      totalBalance,
      accounts: accSummaries,
    };
  });
}

export interface LedgerRow {
  id: number;
  accountId: number;
  accountName: string;
  currency: string;
  date: string;
  dateUnknown: boolean;
  type: string;
  amount: number;
  signedAmount: number;
  runningBalance: number;
  concept: string;
  notes: string | null;
  refAmount: number | null;
  refCurrency: string | null;
  transferGroupId: string | null;
  settlementPeriod: string | null;
}

export async function getPersonDetailBySlug(slug: string) {
  const person = await db.query.people.findFirst({
    where: eq(people.slug, slug),
    with: {
      accounts: {
        orderBy: [asc(accounts.sortOrder), asc(accounts.id)],
        with: {
          transactions: {
            orderBy: [asc(transactions.date), asc(transactions.sortOrder), asc(transactions.id)],
          },
        },
      },
      monthlyItems: {
        orderBy: [desc(monthlyItems.period), asc(monthlyItems.sortOrder), asc(monthlyItems.id)],
      },
    },
  });

  if (!person) return null;

  return buildPersonDetail(person);
}

export async function getPersonDetailByShareToken(token: string) {
  const person = await db.query.people.findFirst({
    where: eq(people.shareToken, token),
    with: {
      accounts: {
        orderBy: [asc(accounts.sortOrder), asc(accounts.id)],
        with: {
          transactions: {
            orderBy: [asc(transactions.date), asc(transactions.sortOrder), asc(transactions.id)],
          },
        },
      },
      monthlyItems: {
        orderBy: [desc(monthlyItems.period), asc(monthlyItems.sortOrder), asc(monthlyItems.id)],
      },
    },
  });

  if (!person || !person.shareEnabled) return null;

  return buildPersonDetail(person);
}

function buildPersonDetail(
  person: NonNullable<Awaited<ReturnType<typeof db.query.people.findFirst>>> & {
    accounts: Array<
      typeof accounts.$inferSelect & {
        transactions: Array<typeof transactions.$inferSelect>;
      }
    >;
    monthlyItems: Array<typeof monthlyItems.$inferSelect>;
  }
) {
  const accountMap = new Map(person.accounts.map((a) => [a.id, a]));

  // Saldo por subcuenta y movimientos con saldo corrido por subcuenta y global
  const accountSummaries: AccountSummary[] = [];
  const ledgerByAccount = new Map<number, LedgerRow[]>();

  for (const acc of person.accounts) {
    let running = Number(acc.initialBalance);
    const rows: LedgerRow[] = [];
    for (const tx of acc.transactions) {
      const amt = Number(tx.amount);
      const signed = computeSignedDelta(tx.type, amt);
      running = Math.round((running + signed) * 100) / 100;
      rows.push({
        id: tx.id,
        accountId: acc.id,
        accountName: acc.name,
        currency: acc.currency,
        date: tx.date,
        dateUnknown: tx.dateUnknown,
        type: tx.type,
        amount: amt,
        signedAmount: signed,
        runningBalance: running,
        concept: tx.concept,
        notes: tx.notes,
        refAmount: tx.refAmount ? Number(tx.refAmount) : null,
        refCurrency: tx.refCurrency,
        transferGroupId: tx.transferGroupId,
        settlementPeriod: tx.settlementPeriod,
      });
    }
    ledgerByAccount.set(acc.id, rows);
    accountSummaries.push({
      id: acc.id,
      personId: person.id,
      name: acc.name,
      currency: acc.currency,
      initialBalance: Number(acc.initialBalance),
      balance: running,
      txCount: acc.transactions.length,
      isActive: acc.isActive,
    });
  }

  // Vista consolidada (todas las cuentas de la moneda principal ordenadas cronológicamente)
  const combinedInitial = person.accounts
    .filter((a) => a.currency === person.defaultCurrency)
    .reduce((acc, a) => acc + Number(a.initialBalance), 0);

  const allRawTx = person.accounts
    .flatMap((a) => a.transactions.map((t) => ({ tx: t, acc: a })))
    .sort((a, b) => {
      if (a.tx.date !== b.tx.date) return a.tx.date.localeCompare(b.tx.date);
      if (a.tx.sortOrder !== b.tx.sortOrder) return a.tx.sortOrder - b.tx.sortOrder;
      return a.tx.id - b.tx.id;
    });

  let runningCombined = combinedInitial;
  const combinedLedger: LedgerRow[] = allRawTx.map(({ tx, acc }) => {
    const amt = Number(tx.amount);
    const signed = computeSignedDelta(tx.type, amt);
    if (acc.currency === person.defaultCurrency) {
      runningCombined = Math.round((runningCombined + signed) * 100) / 100;
    }
    return {
      id: tx.id,
      accountId: acc.id,
      accountName: acc.name,
      currency: acc.currency,
      date: tx.date,
      dateUnknown: tx.dateUnknown,
      type: tx.type,
      amount: amt,
      signedAmount: signed,
      runningBalance:
        acc.currency === person.defaultCurrency
          ? runningCombined
          : (ledgerByAccount.get(acc.id)?.find((r) => r.id === tx.id)?.runningBalance ?? 0),
      concept: tx.concept,
      notes: tx.notes,
      refAmount: tx.refAmount ? Number(tx.refAmount) : null,
      refCurrency: tx.refCurrency,
      transferGroupId: tx.transferGroupId,
      settlementPeriod: tx.settlementPeriod,
    };
  });

  // Agrupar resúmenes mensuales si tiene servicios/extras
  const periodsMap = new Map<
    string,
    {
      period: string;
      total: number;
      settledTotal: number;
      unsettledTotal: number;
      items: Array<typeof monthlyItems.$inferSelect>;
    }
  >();

  for (const item of person.monthlyItems) {
    let grp = periodsMap.get(item.period);
    if (!grp) {
      grp = { period: item.period, total: 0, settledTotal: 0, unsettledTotal: 0, items: [] };
      periodsMap.set(item.period, grp);
    }
    const amt = Number(item.amount ?? 0);
    grp.total = Math.round((grp.total + amt) * 100) / 100;
    if (item.settledTransactionId) {
      grp.settledTotal = Math.round((grp.settledTotal + amt) * 100) / 100;
    } else {
      grp.unsettledTotal = Math.round((grp.unsettledTotal + amt) * 100) / 100;
    }
    grp.items.push(item);
  }

  return {
    person: {
      id: person.id,
      name: person.name,
      slug: person.slug,
      defaultCurrency: person.defaultCurrency,
      isOwn: person.isOwn,
      hasManagedAccount: person.hasManagedAccount,
      shareToken: person.shareToken,
      sharePin: person.sharePin,
      shareEnabled: person.shareEnabled,
      notes: person.notes,
    },
    totalBalance:
      Math.round(
        accountSummaries
          .filter((a) => a.currency === person.defaultCurrency)
          .reduce((acc, a) => acc + a.balance, 0) * 100
      ) / 100,
    accounts: accountSummaries,
    combinedLedger: combinedLedger.reverse(), // más recientes arriba para comodidad diaria
    ledgerByAccount: Object.fromEntries(
      Array.from(ledgerByAccount.entries()).map(([k, v]) => [k, [...v].reverse()])
    ),
    monthlySummaries: Array.from(periodsMap.values()),
    accountMap: Object.fromEntries(accountMap.entries()),
  };
}

export async function getMonthlyPaymentsData(period: string) {
  const [allPeople, allServices, items, carryOverItems, existingPeriodsRows] =
    await Promise.all([
      getPeopleWithBalances(),
      db.query.services.findMany({
        orderBy: [asc(services.sortOrder), asc(services.id)],
        with: { person: true },
      }),
      db.query.monthlyItems.findMany({
        where: eq(monthlyItems.period, period),
        orderBy: [
          asc(monthlyItems.dueDate),
          asc(monthlyItems.sortOrder),
          asc(monthlyItems.id),
        ],
        with: {
          person: true,
          service: true,
          settledTransaction: {
            with: { account: true },
          },
        },
      }),
      db.query.monthlyItems.findMany({
        where: and(
          lt(monthlyItems.period, period),
          eq(monthlyItems.status, "PENDING")
        ),
        orderBy: [
          desc(monthlyItems.period),
          asc(monthlyItems.dueDate),
          asc(monthlyItems.sortOrder),
        ],
        with: {
          person: true,
          service: true,
          settledTransaction: {
            with: { account: true },
          },
        },
      }),
      db
        .selectDistinct({ period: monthlyItems.period })
        .from(monthlyItems)
        .orderBy(desc(monthlyItems.period)),
    ]);

  const activeServicesCount = allServices.filter((s) => s.isActive).length;
  const existingServiceIds = new Set(items.map((i) => i.serviceId).filter(Boolean));
  const missingServicesCount = allServices.filter(
    (s) => s.isActive && !existingServiceIds.has(s.id)
  ).length;

  return {
    period,
    people: allPeople,
    services: allServices,
    items,
    carryOverItems,
    activeServicesCount,
    missingServicesCount,
    availablePeriods: existingPeriodsRows.map((r) => r.period),
  };
}
