import { ensureDbSchema, getD1, getRuntimeEnv } from "../../db";
import { funds, holdings as baselineHoldings, type FundProfile, type Holding } from "../data/funds";
import { DELIVERY_CLAIM_SQL } from "./alertDelivery";
import { buildAlertEmail, summarizeChanges, type HoldingChanges } from "./holdingChanges";

type Filing = {
  accession: string;
  period: string;
  filedAt: string;
};

type SnapshotRow = {
  id: number;
  fund_id: string;
  accession: string;
  period: string;
  filed_at: string;
  data_json: string;
  change_json: string;
  checked_at: string;
};

type SubscriberRow = {
  id: number;
  email: string;
  fund_ids: string;
  unsubscribe_token: string;
  created_at: string;
};

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const secHeaders = {
  "accept-encoding": "gzip, deflate",
  "user-agent": "HoldingsLens/1.0 public 13F research monitor",
};

function quarterLabel(reportDate: string) {
  const [year, month] = reportDate.split("-").map(Number);
  return `${year} Q${Math.ceil(month / 3)}`;
}

async function latestFiling(fund: FundProfile): Promise<Filing> {
  const response = await fetch(`https://data.sec.gov/submissions/CIK${fund.cik}.json`, {
    headers: secHeaders,
  });
  if (!response.ok) throw new Error(`SEC submissions ${response.status}`);
  const payload = (await response.json()) as {
    filings?: {
      recent?: {
        form?: string[];
        accessionNumber?: string[];
        reportDate?: string[];
        filingDate?: string[];
      };
    };
  };
  const recent = payload.filings?.recent;
  const index = recent?.form?.findIndex((form) => form === "13F-HR" || form === "13F-HR/A") ?? -1;
  if (!recent || index < 0) throw new Error("SEC 未返回13F-HR记录");
  const accession = recent.accessionNumber?.[index];
  const reportDate = recent.reportDate?.[index];
  const filedAt = recent.filingDate?.[index];
  if (!accession || !reportDate || !filedAt) throw new Error("SEC 申报字段不完整");
  return { accession: accession.replaceAll("-", ""), period: quarterLabel(reportDate), filedAt };
}

async function fetchHoldingRows(accession: string): Promise<Holding[]> {
  const response = await fetch(`https://13f.info/data/13f/${accession}`);
  if (!response.ok) throw new Error(`13F holdings ${response.status}`);
  const payload = (await response.json()) as { data?: unknown[][] };
  if (!Array.isArray(payload.data) || !payload.data.length) throw new Error("持仓明细尚未生成");
  return payload.data.map((row) => ({
    ticker: String(row[0] ?? "?"),
    issuer: String(row[1] ?? "未知发行人"),
    class: String(row[2] ?? ""),
    cusip: String(row[3] ?? ""),
    valueK: Number(row[4] ?? 0),
    weight: Number(row[5] ?? 0),
    shares: row[6] == null ? null : Number(row[6]),
    principal: row[7] == null ? null : Number(row[7]),
    option: row[8] === "PUT" || row[8] === "CALL" ? row[8] : null,
  }));
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function emptyChanges(): HoldingChanges {
  return { baseline: true, added: [], exited: [], increased: [], decreased: [] };
}

async function sendAlerts(fund: FundProfile, filing: Filing, changes: HoldingChanges, discoveredAt: string) {
  const runtime = getRuntimeEnv();
  if (!runtime.RESEND_API_KEY || !runtime.ALERT_FROM_EMAIL || !runtime.PUBLIC_SITE_URL) {
    return { sent: 0, emailStatus: "not_configured" as const };
  }

  const db = getD1();
  const result = await db
    .prepare(`SELECT id, email, fund_ids, unsubscribe_token, created_at
      FROM subscribers
      WHERE status = 'active' AND datetime(created_at) <= datetime(?)`)
    .bind(discoveredAt)
    .all<SubscriberRow>();
  let sent = 0;

  for (const subscriber of result.results) {
    const selected = safeJson<string[]>(subscriber.fund_ids, []);
    if (!selected.includes(fund.id)) continue;

    const claim = await db
      .prepare(DELIVERY_CLAIM_SQL)
      .bind(subscriber.id, fund.id, filing.accession)
      .run();
    if (Number(claim.meta.changes ?? 0) === 0) continue;

    const email = buildAlertEmail({
      fundName: fund.nameZh,
      period: filing.period,
      filedAt: filing.filedAt,
      changes,
      publicSiteUrl: runtime.PUBLIC_SITE_URL,
      unsubscribeToken: subscriber.unsubscribe_token,
    });

    let status = "failed";
    let providerId: string | null = null;
    let error: string | null = null;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${runtime.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: runtime.ALERT_FROM_EMAIL,
          to: [subscriber.email],
          subject: email.subject,
          html: email.html,
        }),
      });
      const responseBody = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) throw new Error(responseBody.message ?? `邮件服务 ${response.status}`);
      status = "sent";
      providerId = responseBody.id ?? null;
      sent += 1;
    } catch (cause) {
      error = cause instanceof Error ? cause.message.slice(0, 500) : "邮件发送失败";
    }

    await db
      .prepare(`UPDATE alert_deliveries
        SET provider_id = ?, status = ?, error = ?, created_at = CURRENT_TIMESTAMP
        WHERE subscriber_id = ? AND fund_id = ? AND accession = ?`)
      .bind(providerId, status, error, subscriber.id, fund.id, filing.accession)
      .run();
  }

  return { sent, emailStatus: "configured" as const };
}

async function retryPendingAlerts() {
  const runtime = getRuntimeEnv();
  if (!runtime.RESEND_API_KEY || !runtime.ALERT_FROM_EMAIL || !runtime.PUBLIC_SITE_URL) {
    return { sent: 0, emailStatus: "not_configured" as const };
  }

  const db = getD1();
  const snapshots = await db.prepare(`SELECT fund_id, accession, period, filed_at, data_json, change_json, checked_at
    FROM fund_snapshots
    WHERE id IN (SELECT MAX(id) FROM fund_snapshots GROUP BY fund_id)`).all<SnapshotRow>();
  let sent = 0;

  for (const snapshot of snapshots.results) {
    const changes = safeJson<HoldingChanges>(snapshot.change_json, emptyChanges());
    if (changes.baseline) continue;
    const fund = funds.find((candidate) => candidate.id === snapshot.fund_id);
    if (!fund) continue;
    const delivery = await sendAlerts(
      fund,
      { accession: snapshot.accession, period: snapshot.period, filedAt: snapshot.filed_at },
      changes,
      snapshot.checked_at,
    );
    sent += delivery.sent;
  }

  return { sent, emailStatus: "configured" as const };
}

export async function refreshHoldings({ force = false }: { force?: boolean } = {}) {
  await ensureDbSchema();
  const db = getD1();
  const lastRefresh = await db.prepare("SELECT value FROM system_state WHERE key = 'last_refresh'").first<{ value: string }>();
  const lastTimestamp = lastRefresh ? Date.parse(lastRefresh.value) : 0;
  if (!force && Date.now() - lastTimestamp < CHECK_INTERVAL_MS) {
    return { skipped: true, reason: "rate_limited", checkedAt: lastRefresh?.value };
  }

  const checkedAt = new Date().toISOString();
  await db
    .prepare("INSERT INTO system_state (key, value, updated_at) VALUES ('last_refresh', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
    .bind(checkedAt)
    .run();

  const pendingAlertRetry = await retryPendingAlerts();
  const results: Array<Record<string, unknown>> = [];
  for (const fund of funds) {
    try {
      const latest = await latestFiling(fund);
      const previous = await db
        .prepare(`SELECT id, fund_id, accession, period, filed_at, data_json, change_json, checked_at
          FROM fund_snapshots WHERE fund_id = ? ORDER BY id DESC LIMIT 1`)
        .bind(fund.id)
        .first<SnapshotRow>();
      if (previous?.accession === latest.accession) {
        results.push({ fundId: fund.id, status: "unchanged", accession: latest.accession });
        continue;
      }

      let current: Holding[];
      try {
        current = await fetchHoldingRows(latest.accession);
      } catch (cause) {
        const baselineAccession = fund.filingSource.match(/\/13f\/(\d+)/)?.[1];
        if (previous || baselineAccession !== latest.accession) throw cause;
        current = baselineHoldings[fund.id];
      }
      const previousRows = previous ? safeJson<Holding[]>(previous.data_json, []) : [];
      const changes = previous ? summarizeChanges(previousRows, current) : emptyChanges();
      await db
        .prepare(`INSERT OR IGNORE INTO fund_snapshots
          (fund_id, accession, period, filed_at, data_json, change_json, checked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          fund.id,
          latest.accession,
          latest.period,
          latest.filedAt,
          JSON.stringify(current),
          JSON.stringify(changes),
          checkedAt,
        )
        .run();
      const delivery = previous
        ? await sendAlerts(fund, latest, changes, checkedAt)
        : { sent: 0, emailStatus: "baseline" as const };
      results.push({ fundId: fund.id, status: previous ? "updated" : "seeded", accession: latest.accession, ...delivery });
    } catch (cause) {
      results.push({ fundId: fund.id, status: "error", error: cause instanceof Error ? cause.message : "刷新失败" });
    }
  }

  return { skipped: false, checkedAt, pendingAlertRetry, results };
}
