import {
  pgTable,
  serial,
  text,
  numeric,
  boolean,
  integer,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  defaultCurrency: text("default_currency").notNull().default("ARS"), // 'ARS' | 'USD'
  isOwn: boolean("is_own").notNull().default(false), // true for Fer (own services, no managed third-party balance card unless desired)
  hasManagedAccount: boolean("has_managed_account").notNull().default(true),
  shareToken: text("share_token").unique(),
  sharePin: text("share_pin"), // optional 4-6 digit PIN for family view
  shareEnabled: boolean("share_enabled").notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. 'Principal', 'Cocos', 'Balanz', 'Otros', 'Ahorros'
    currency: text("currency").notNull().default("ARS"), // 'ARS' | 'USD'
    initialBalance: numeric("initial_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("accounts_person_idx").on(t.personId)]
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(), // YYYY-MM-DD (nullable fallback handled at import with earliest date)
    dateUnknown: boolean("date_unknown").notNull().default(false),
    type: text("type").notNull(), // 'IN' | 'OUT' | 'YIELD' | 'TRANSFER_IN' | 'TRANSFER_OUT'
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), // always positive
    concept: text("concept").notNull(),
    notes: text("notes"),
    refAmount: numeric("ref_amount", { precision: 14, scale: 2 }), // e.g. original ARS or USD amount
    refCurrency: text("ref_currency"), // 'ARS' | 'USD'
    transferGroupId: text("transfer_group_id"), // pairs TRANSFER_OUT and TRANSFER_IN
    settlementPeriod: text("settlement_period"), // e.g. '2026-10' when created from monthly summary settlement
    sortOrder: integer("sort_order").notNull().default(0), // preserves exact Excel row order on same-day entries
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("tx_account_date_idx").on(t.accountId, t.date, t.sortOrder),
    index("tx_transfer_group_idx").on(t.transferGroupId),
  ]
);

export const services = pgTable(
  "services",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultDueDay: integer("default_due_day"), // 1..31
    defaultAmount: numeric("default_amount", { precision: 14, scale: 2 }),
    paysInArrears: boolean("pays_in_arrears").notNull().default(false), // true = en Nov se paga lo de Oct
    notes: text("notes"), // client number, policy number, house ref, etc.
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("services_person_idx").on(t.personId)]
);

export const monthlyItems = pgTable(
  "monthly_items",
  {
    id: serial("id").primaryKey(),
    period: text("period").notNull(), // 'YYYY-MM' (mes en que se gestiona/paga, ej. '2026-11')
    billedPeriod: text("billed_period"), // 'YYYY-MM' al que corresponde la factura (ej. '2026-10' si es mes vencido)
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    serviceId: integer("service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull().default("SERVICE"), // 'SERVICE' | 'EXTRA'
    concept: text("concept").notNull(),
    dueDate: date("due_date"),
    amount: numeric("amount", { precision: 14, scale: 2 }), // nullable until bill arrives
    status: text("status").notNull().default("PENDING"), // 'PENDING' | 'PAID'
    paidAt: date("paid_at"),
    settledTransactionId: integer("settled_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" }
    ),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("monthly_items_period_idx").on(t.period, t.personId),
    index("monthly_items_settled_idx").on(t.settledTransactionId),
  ]
);

export const peopleRelations = relations(people, ({ many }) => ({
  accounts: many(accounts),
  services: many(services),
  monthlyItems: many(monthlyItems),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  person: one(people, {
    fields: [accounts.personId],
    references: [people.id],
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  settledItems: many(monthlyItems),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  person: one(people, {
    fields: [services.personId],
    references: [people.id],
  }),
  monthlyItems: many(monthlyItems),
}));

export const monthlyItemsRelations = relations(monthlyItems, ({ one }) => ({
  person: one(people, {
    fields: [monthlyItems.personId],
    references: [people.id],
  }),
  service: one(services, {
    fields: [monthlyItems.serviceId],
    references: [services.id],
  }),
  settledTransaction: one(transactions, {
    fields: [monthlyItems.settledTransactionId],
    references: [transactions.id],
  }),
}));
