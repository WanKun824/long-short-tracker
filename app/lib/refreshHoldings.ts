import { ensureDbSchema, getD1, getRuntimeEnv } from "../../db";
import { funds, holdings as baselineHoldings, type FundProfile, type Holding } from "../data/funds";
import { DELIVERY_CLAIM_SQL } from "./alertDelivery";
import { buildAlertEmail, summarizeChanges, type HoldingChanges } from "./holdingChanges";
import { summarizePublicSignals, type DeepSeekDigest } from "./deepseekDigest";
import { buildMarketSignalsEmail, type SignalEmailSection } from "./marketSignalsEmail";
import { officialSourcesForFund, refreshPublicSignals, type PublicSignal } from "./publicSignals";
import { fetchSecHoldingRows, readBoundedText, secHeaders } from "./sec13f";

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

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const REFRESH_CAPABILITY_VERSION = "sec-edgar-signals-deepseek-v5";
function quarterLabel(reportDate: string) {
  const [year, month] = reportDate.split("-").map(Number);
  return `${year} Q${Math.ceil(month / 3)}`;
}

async function latestFiling(fund: FundProfile): Promise<Filing> {
  const response = await fetch(`https://data.sec.gov/submissions/CIK${fund.cik}.json`, {
    headers: secHeaders,
  });
  if (!response.ok) throw new Error(`SEC submissions ${response.status}`);
  const text = await readBoundedText(response);
  const payload = JSON.parse(text) as {
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
    return { sent: 0, failed: 0, emailStatus: "not_configured" as const };
  }

  const db = getD1();
  const result = await db
    .prepare(`SELECT id, email, fund_ids, unsubscribe_token, created_at
      FROM subscribers
      WHERE status = 'active' AND datetime(created_at) <= datetime(?)`)
    .bind(discoveredAt)
    .all<SubscriberRow>();
  let sent = 0;
  let failed = 0;

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
      failed += 1;
    }

    await db
      .prepare(`UPDATE alert_deliveries
        SET provider_id = ?, status = ?, error = ?, created_at = CURRENT_TIMESTAMP
        WHERE subscriber_id = ? AND fund_id = ? AND accession = ?`)
      .bind(providerId, status, error, subscriber.id, fund.id, filing.accession)
      .run();
  }

  return { sent, failed, emailStatus: "configured" as const };
}

async function retryPendingAlerts() {
  const runtime = getRuntimeEnv();
  if (!runtime.RESEND_API_KEY || !runtime.ALERT_FROM_EMAIL || !runtime.PUBLIC_SITE_URL) {
    return { sent: 0, failed: 0, emailStatus: "not_configured" as const };
  }

  const db = getD1();
  const snapshots = await db.prepare(`SELECT fund_id, accession, period, filed_at, data_json, change_json, checked_at
    FROM fund_snapshots
    WHERE id IN (SELECT MAX(id) FROM fund_snapshots GROUP BY fund_id)`).all<SnapshotRow>();
  let sent = 0;
  let failed = 0;

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
    failed += delivery.failed;
  }

  return { sent, failed, emailStatus: "configured" as const };
}

async function digestAccession(signals: PublicSignal[]) {
  const input = new TextEncoder().encode(signals.map((signal) => signal.id).sort().join("|"));
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `signals:${hash.slice(0, 32)}`;
}

async function sendPublicSignalDigests(signals: PublicSignal[], discoveredAt: string) {
  const runtime = getRuntimeEnv();
  if (!signals.length) {
    return {
      sent: 0,
      failed: 0,
      summaryStatus: "not_needed" as const,
      emailStatus: runtime.RESEND_API_KEY && runtime.ALERT_FROM_EMAIL && runtime.PUBLIC_SITE_URL
        ? "configured" as const
        : "not_configured" as const,
    };
  }
  if (!runtime.RESEND_API_KEY || !runtime.ALERT_FROM_EMAIL || !runtime.PUBLIC_SITE_URL) {
    return { sent: 0, failed: 0, emailStatus: "not_configured" as const };
  }

  const db = getD1();
  const accession = await digestAccession(signals);
  const subscribers = await db.prepare(`SELECT id, email, fund_ids, unsubscribe_token, created_at
    FROM subscribers
    WHERE status = 'active' AND datetime(created_at) <= datetime(?)`)
    .bind(discoveredAt)
    .all<SubscriberRow>();
  let sent = 0;
  let failed = 0;
  let digest: DeepSeekDigest | null = null;
  let summaryStatus: "deepseek" | "not_configured" | "error" = runtime.DEEPSEEK_API_KEY
    ? "deepseek"
    : "not_configured";
  let summaryError: string | null = null;

  try {
    digest = await summarizePublicSignals(signals, runtime);
  } catch (cause) {
    summaryStatus = "error";
    summaryError = cause instanceof Error ? cause.message.slice(0, 500) : "DeepSeek 摘要失败";
    console.error(JSON.stringify({ event: "deepseek_digest_failed", error: summaryError }));
  }

  for (const subscriber of subscribers.results) {
    const selected = new Set(safeJson<string[]>(subscriber.fund_ids, []));
    const relevant = signals.filter((signal) => selected.has(signal.fundId));
    if (!relevant.length) continue;

    const claim = await db.prepare(DELIVERY_CLAIM_SQL)
      .bind(subscriber.id, "__signals__", accession)
      .run();
    if (Number(claim.meta.changes ?? 0) === 0) continue;

    const sections = funds.flatMap<SignalEmailSection>((fund) => {
      const fundSignals = relevant.filter((signal) => signal.fundId === fund.id);
      return fundSignals.length ? [{
        fundId: fund.id,
        fundName: fund.nameZh,
        signals: fundSignals,
        officialSources: officialSourcesForFund(fund.id),
      }] : [];
    });
    const email = buildMarketSignalsEmail({
      sections,
      publicSiteUrl: runtime.PUBLIC_SITE_URL,
      unsubscribeToken: subscriber.unsubscribe_token,
      digest: digest ? {
        ...digest,
        items: digest.items.filter((item) => relevant.some((signal) => signal.id === item.signalId)),
      } : null,
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
      const responseText = await readBoundedText(response, 100_000);
      const responseBody = responseText ? JSON.parse(responseText) as { id?: string; message?: string } : {};
      if (!response.ok) throw new Error(responseBody.message ?? `邮件服务 ${response.status}`);
      status = "sent";
      providerId = responseBody.id ?? null;
      sent += 1;
    } catch (cause) {
      error = cause instanceof Error ? cause.message.slice(0, 500) : "公开动态邮件发送失败";
      failed += 1;
    }

    await db.prepare(`UPDATE alert_deliveries
      SET provider_id = ?, status = ?, error = ?, created_at = CURRENT_TIMESTAMP
      WHERE subscriber_id = ? AND fund_id = '__signals__' AND accession = ?`)
      .bind(providerId, status, error, subscriber.id, accession)
      .run();
  }

  return {
    sent,
    failed,
    emailStatus: "configured" as const,
    summaryStatus,
    summaryModel: digest?.model ?? runtime.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    summaryError,
  };
}

export async function refreshHoldings({ force = false }: { force?: boolean } = {}) {
  await ensureDbSchema();
  const db = getD1();
  const [lastRefresh, capabilityVersion] = await Promise.all([
    db.prepare("SELECT value FROM system_state WHERE key = 'last_refresh'").first<{ value: string }>(),
    db.prepare("SELECT value FROM system_state WHERE key = 'refresh_capability_version'").first<{ value: string }>(),
  ]);
  const lastTimestamp = lastRefresh ? Date.parse(lastRefresh.value) : 0;
  const capabilityUpgradePending = capabilityVersion?.value !== REFRESH_CAPABILITY_VERSION;
  if (!force && !capabilityUpgradePending && Date.now() - lastTimestamp < CHECK_INTERVAL_MS) {
    return { skipped: true, reason: "rate_limited", checkedAt: lastRefresh?.value };
  }

  const checkedAt = new Date().toISOString();
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
        const sourceMarkerKey = `sec_source_accession:${fund.id}`;
        const sourceMarker = await db.prepare("SELECT value FROM system_state WHERE key = ?")
          .bind(sourceMarkerKey)
          .first<{ value: string }>();
        if (sourceMarker?.value === latest.accession) {
          results.push({ fundId: fund.id, status: "unchanged", accession: latest.accession, source: "sec_edgar" });
          continue;
        }

        const previousRows = safeJson<Holding[]>(previous.data_json, []);
        const officialRows = await fetchSecHoldingRows(
          fund,
          latest.accession,
          [...previousRows, ...baselineHoldings[fund.id]],
        );
        await db.prepare("UPDATE fund_snapshots SET data_json = ?, checked_at = ? WHERE id = ?")
          .bind(JSON.stringify(officialRows), checkedAt, previous.id)
          .run();
        await db.prepare(`INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
          .bind(sourceMarkerKey, latest.accession)
          .run();
        results.push({ fundId: fund.id, status: "revalidated_sec", accession: latest.accession, source: "sec_edgar" });
        continue;
      }

      const previousRows = previous ? safeJson<Holding[]>(previous.data_json, []) : [];
      const current = await fetchSecHoldingRows(
        fund,
        latest.accession,
        [...previousRows, ...baselineHoldings[fund.id]],
      );
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
      await db.prepare(`INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
        .bind(`sec_source_accession:${fund.id}`, latest.accession)
        .run();
      const delivery = previous
        ? await sendAlerts(fund, latest, changes, checkedAt)
        : { sent: 0, failed: 0, emailStatus: "baseline" as const };
      results.push({ fundId: fund.id, status: previous ? "updated" : "seeded", accession: latest.accession, source: "sec_edgar", ...delivery });
    } catch (cause) {
      results.push({ fundId: fund.id, status: "error", error: cause instanceof Error ? cause.message : "刷新失败" });
    }
  }

  const publicSignals = await refreshPublicSignals(checkedAt);
  const publicSignalDelivery = await sendPublicSignalDigests(publicSignals.newSignals, checkedAt);

  await db.batch([
    db.prepare(`INSERT INTO system_state (key, value, updated_at)
      VALUES ('last_refresh', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
      .bind(checkedAt),
    db.prepare(`INSERT INTO system_state (key, value, updated_at)
      VALUES ('refresh_capability_version', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
      .bind(REFRESH_CAPABILITY_VERSION),
  ]);

  return {
    skipped: false,
    checkedAt,
    pendingAlertRetry,
    results,
    publicSignals: {
      checkedFunds: publicSignals.checkedFunds,
      newCount: publicSignals.newCount,
      baselineCount: publicSignals.baselineCount,
      errors: publicSignals.errors,
      xStatus: publicSignals.xStatus,
      mediaStatus: publicSignals.mediaStatus,
      directFeedCount: publicSignals.directFeedCount,
      gdeltStatus: publicSignals.gdeltStatus,
    },
    publicSignalDelivery,
  };
}
