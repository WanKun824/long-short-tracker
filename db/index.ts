import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeEnv = {
  DB?: D1Database;
  RESEND_API_KEY?: string;
  ALERT_FROM_EMAIL?: string;
  PUBLIC_SITE_URL?: string;
  REFRESH_SECRET?: string;
  ADMIN_EMAIL?: string;
};

export function getRuntimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function getD1() {
  const runtime = getRuntimeEnv();
  if (!runtime.DB) throw new Error("订阅数据库暂不可用，请稍后重试。");
  return runtime.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export async function ensureDbSchema() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      fund_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      unsubscribe_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers(unsubscribe_token)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS fund_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id TEXT NOT NULL,
      accession TEXT NOT NULL,
      period TEXT NOT NULL,
      filed_at TEXT NOT NULL,
      data_json TEXT NOT NULL,
      change_json TEXT NOT NULL DEFAULT '{}',
      checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_snapshots_accession ON fund_snapshots(fund_id, accession)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_fund_snapshots_latest ON fund_snapshots(fund_id, id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS system_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS alert_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscriber_id INTEGER NOT NULL,
      fund_id TEXT NOT NULL,
      accession TEXT NOT NULL,
      provider_id TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_delivery_once ON alert_deliveries(subscriber_id, fund_id, accession)"),
  ]);
  await db.prepare("PRAGMA optimize").run();
}
