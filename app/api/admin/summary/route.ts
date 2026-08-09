import { ensureDbSchema, getD1, getRuntimeEnv } from "../../../../db";
import { funds } from "../../../data/funds";
import { isAdminRequest } from "../../../lib/adminAccess";

type SubscriberTotals = {
  total: number;
  active: number;
  unsubscribed: number;
  today: number;
  last_7_days: number;
};

type DailySignupRow = { day: string; signups: number };
type SnapshotTotals = { snapshot_count: number; fund_count: number };
type SnapshotRow = {
  fund_id: string;
  accession: string;
  period: string;
  filed_at: string;
  checked_at: string;
  holding_count: number;
  change_json: string;
};
type AlertTotalRow = { status: string; count: number };
type AlertRow = {
  fund_id: string;
  accession: string;
  status: string;
  provider_id: string | null;
  error: string | null;
  created_at: string;
};
type RefreshRow = { value: string; updated_at: string };
type RefreshRunTotalRow = { status: string; count: number };
type RefreshRunRow = {
  id: string;
  trigger: string;
  scheduled_at: string | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  reason: string | null;
  duration_ms: number | null;
  fund_checks: number;
  updated_funds: number;
  public_signal_count: number;
  emails_sent: number;
  emails_failed: number;
  error: string | null;
};
type PublicSignalTotal = { count: number; fund_count: number };
type PublicSignalRow = {
  fund_id: string;
  kind: string;
  source_name: string;
  source_url: string;
  title: string;
  published_at: string;
  discovered_at: string;
};
type StoredChanges = {
  baseline?: boolean;
  added?: unknown[];
  exited?: unknown[];
  increased?: unknown[];
  decreased?: unknown[];
};

function number(value: number | null | undefined) {
  return Number(value ?? 0);
}

function parseChanges(value: string) {
  try {
    const changes = JSON.parse(value) as StoredChanges;
    return {
      baseline: Boolean(changes.baseline),
      added: changes.added?.length ?? 0,
      exited: changes.exited?.length ?? 0,
      increased: changes.increased?.length ?? 0,
      decreased: changes.decreased?.length ?? 0,
    };
  } catch {
    return { baseline: false, added: 0, exited: 0, increased: 0, decreased: 0 };
  }
}

export async function GET(request: Request) {
  const runtime = getRuntimeEnv();
  if (!isAdminRequest(request.headers, runtime.ADMIN_EMAIL)) {
    return Response.json({ error: "无权访问管理数据" }, { status: 403 });
  }

  try {
    await ensureDbSchema();
    const db = getD1();
    const [subscriberTotals, dailySignups, snapshotTotals, snapshots, alertTotals, alerts, lastRefresh, publicSignalTotals, publicSignals, refreshRunTotals, refreshRuns] = await Promise.all([
      db.prepare(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'unsubscribed' THEN 1 ELSE 0 END) AS unsubscribed,
        SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN datetime(created_at) >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last_7_days
        FROM subscribers`).first<SubscriberTotals>(),
      db.prepare(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS signups
        FROM subscribers
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day DESC
        LIMIT 30`).all<DailySignupRow>(),
      db.prepare(`SELECT COUNT(*) AS snapshot_count, COUNT(DISTINCT fund_id) AS fund_count
        FROM fund_snapshots`).first<SnapshotTotals>(),
      db.prepare(`SELECT fund_id, accession, period, filed_at, checked_at,
        json_array_length(data_json) AS holding_count, change_json
        FROM fund_snapshots
        ORDER BY checked_at DESC
        LIMIT 80`).all<SnapshotRow>(),
      db.prepare(`SELECT status, COUNT(*) AS count
        FROM alert_deliveries
        GROUP BY status`).all<AlertTotalRow>(),
      db.prepare(`SELECT fund_id, accession, status, provider_id, error, created_at
        FROM alert_deliveries
        ORDER BY id DESC
        LIMIT 50`).all<AlertRow>(),
      db.prepare("SELECT value, updated_at FROM system_state WHERE key = 'last_refresh'").first<RefreshRow>(),
      db.prepare("SELECT COUNT(*) AS count, COUNT(DISTINCT fund_id) AS fund_count FROM public_signals").first<PublicSignalTotal>(),
      db.prepare(`SELECT fund_id, kind, source_name, source_url, title, published_at, discovered_at
        FROM public_signals ORDER BY datetime(published_at) DESC LIMIT 50`).all<PublicSignalRow>(),
      db.prepare(`SELECT status, COUNT(*) AS count
        FROM refresh_runs GROUP BY status`).all<RefreshRunTotalRow>(),
      db.prepare(`SELECT id, trigger, scheduled_at, started_at, completed_at, status, reason,
        duration_ms, fund_checks, updated_funds, public_signal_count, emails_sent, emails_failed, error
        FROM refresh_runs ORDER BY datetime(started_at) DESC LIMIT 60`).all<RefreshRunRow>(),
    ]);

    const fundNames = new Map<string, string>([
      ...funds.map((fund) => [fund.id, fund.nameZh] as const),
      ["__subscription__", "订阅状态邮件"] as const,
      ["__signals__", "公开动态摘要"] as const,
    ]);
    const deliveryTotals = Object.fromEntries(alertTotals.results.map((row) => [row.status, number(row.count)]));
    const runTotals = Object.fromEntries(refreshRunTotals.results.map((row) => [row.status, number(row.count)]));

    return Response.json({
      generatedAt: new Date().toISOString(),
      lastRefreshAt: lastRefresh?.value ?? lastRefresh?.updated_at ?? null,
      subscribers: {
        total: number(subscriberTotals?.total),
        active: number(subscriberTotals?.active),
        unsubscribed: number(subscriberTotals?.unsubscribed),
        today: number(subscriberTotals?.today),
        last7Days: number(subscriberTotals?.last_7_days),
      },
      dailySignups: dailySignups.results.map((row) => ({ day: row.day, signups: number(row.signups) })),
      dataHistory: {
        snapshotCount: number(snapshotTotals?.snapshot_count),
        fundCount: number(snapshotTotals?.fund_count),
        snapshots: snapshots.results.map((row) => ({
          fundId: row.fund_id,
          fundName: fundNames.get(row.fund_id) ?? row.fund_id,
          accession: row.accession,
          period: row.period,
          filedAt: row.filed_at,
          checkedAt: row.checked_at,
          holdingCount: number(row.holding_count),
          changes: parseChanges(row.change_json),
        })),
      },
      deliveries: {
        sent: number(deliveryTotals.sent),
        failed: number(deliveryTotals.failed),
        sending: number(deliveryTotals.sending),
        recent: alerts.results.map((row) => ({
          fundId: row.fund_id,
          fundName: fundNames.get(row.fund_id) ?? row.fund_id,
          accession: row.accession,
          status: row.status,
          providerId: row.provider_id,
          error: row.error,
          createdAt: row.created_at,
        })),
      },
      publicSignals: {
        count: number(publicSignalTotals?.count),
        fundCount: number(publicSignalTotals?.fund_count),
        recent: publicSignals.results.map((row) => ({
          fundId: row.fund_id,
          fundName: fundNames.get(row.fund_id) ?? row.fund_id,
          kind: row.kind,
          sourceName: row.source_name,
          sourceUrl: row.source_url,
          title: row.title,
          publishedAt: row.published_at,
          discoveredAt: row.discovered_at,
        })),
      },
      runHistory: {
        total: refreshRunTotals.results.reduce((sum, row) => sum + number(row.count), 0),
        succeeded: number(runTotals.succeeded),
        skipped: number(runTotals.skipped),
        failed: number(runTotals.failed),
        running: number(runTotals.running),
        recent: refreshRuns.results.map((row) => ({
          id: row.id,
          trigger: row.trigger,
          scheduledAt: row.scheduled_at,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          status: row.status,
          reason: row.reason,
          durationMs: row.duration_ms,
          fundChecks: number(row.fund_checks),
          updatedFunds: number(row.updated_funds),
          publicSignalCount: number(row.public_signal_count),
          emailsSent: number(row.emails_sent),
          emailsFailed: number(row.emails_failed),
          error: row.error,
        })),
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "管理数据暂不可用";
    return Response.json({ error: message }, { status: 500 });
  }
}
