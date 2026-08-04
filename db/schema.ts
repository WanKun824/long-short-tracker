import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const subscribers = sqliteTable(
  "subscribers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    fundIds: text("fund_ids").notNull().default("[]"),
    status: text("status").notNull().default("active"),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_subscribers_email").on(table.email),
    uniqueIndex("idx_subscribers_token").on(table.unsubscribeToken),
    index("idx_subscribers_status").on(table.status),
  ],
);

export const fundSnapshots = sqliteTable(
  "fund_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fundId: text("fund_id").notNull(),
    accession: text("accession").notNull(),
    period: text("period").notNull(),
    filedAt: text("filed_at").notNull(),
    dataJson: text("data_json").notNull(),
    changeJson: text("change_json").notNull().default("{}"),
    checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_fund_snapshots_accession").on(table.fundId, table.accession),
    index("idx_fund_snapshots_latest").on(table.fundId, table.id),
  ],
);

export const systemState = sqliteTable("system_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const alertDeliveries = sqliteTable(
  "alert_deliveries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subscriberId: integer("subscriber_id").notNull(),
    fundId: text("fund_id").notNull(),
    accession: text("accession").notNull(),
    providerId: text("provider_id"),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_alert_delivery_once").on(table.subscriberId, table.fundId, table.accession),
  ],
);

export const publicSignals = sqliteTable(
  "public_signals",
  {
    id: text("id").primaryKey(),
    fundId: text("fund_id").notNull(),
    kind: text("kind").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    publishedAt: text("published_at").notNull(),
    discoveredAt: text("discovered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_public_signals_fund_url").on(table.fundId, table.sourceUrl),
    index("idx_public_signals_latest").on(table.fundId, table.publishedAt),
  ],
);
