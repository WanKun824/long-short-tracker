import { ensureDbSchema, getD1, getRuntimeEnv } from "../../db";
import { funds, holdings as baselineHoldings, type FundProfile, type Holding } from "../data/funds";

type Filing = {
  accession: string;
  period: string;
  filedAt: string;
};

type SnapshotRow = {
  id: number;
  accession: string;
  data_json: string;
};

type SubscriberRow = {
  id: number;
  email: string;
  fund_ids: string;
  unsubscribe_token: string;
};

type ChangeItem = {
  ticker: string;
  option: Holding["option"];
  before: number;
  after: number;
};

export type HoldingChanges = {
  baseline?: boolean;
  added: ChangeItem[];
  exited: ChangeItem[];
  increased: ChangeItem[];
  decreased: ChangeItem[];
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

function holdingKey(row: Holding) {
  return `${row.cusip}|${row.option ?? "SHARES"}`;
}

function summarizeChanges(previous: Holding[], current: Holding[]): HoldingChanges {
  const before = new Map(previous.map((row) => [holdingKey(row), row]));
  const after = new Map(current.map((row) => [holdingKey(row), row]));
  const added: ChangeItem[] = [];
  const exited: ChangeItem[] = [];
  const increased: ChangeItem[] = [];
  const decreased: ChangeItem[] = [];

  for (const [key, row] of after) {
    const prior = before.get(key);
    const item = { ticker: row.ticker, option: row.option, before: prior?.weight ?? 0, after: row.weight };
    if (!prior) added.push(item);
    else if (row.weight - prior.weight >= 0.1) increased.push(item);
    else if (prior.weight - row.weight >= 0.1) decreased.push(item);
  }
  for (const [key, row] of before) {
    if (!after.has(key)) exited.push({ ticker: row.ticker, option: row.option, before: row.weight, after: 0 });
  }

  const byMagnitude = (a: ChangeItem, b: ChangeItem) =>
    Math.abs(b.after - b.before) - Math.abs(a.after - a.before);
  return {
    added: added.sort(byMagnitude),
    exited: exited.sort(byMagnitude),
    increased: increased.sort(byMagnitude),
    decreased: decreased.sort(byMagnitude),
  };
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
  const index = recent?.form?.findIndex((form) => form === "13F-HR") ?? -1;
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function changeList(title: string, rows: ChangeItem[], direction: "up" | "down") {
  if (!rows.length) return "";
  return `<h3 style="margin:24px 0 8px;color:#122338">${title}</h3><ul style="margin:0;padding-left:20px;color:#435366">${rows
    .slice(0, 8)
    .map((row) => `<li>${escapeHtml(row.ticker)}${row.option ? ` ${row.option}` : ""}：${row.before.toFixed(1)}% ${direction === "up" ? "→" : "→"} ${row.after.toFixed(1)}%</li>`)
    .join("")}</ul>`;
}

async function sendAlerts(fund: FundProfile, filing: Filing, changes: HoldingChanges) {
  const runtime = getRuntimeEnv();
  if (!runtime.RESEND_API_KEY || !runtime.ALERT_FROM_EMAIL || !runtime.PUBLIC_SITE_URL) {
    return { sent: 0, emailStatus: "not_configured" as const };
  }

  const db = getD1();
  const result = await db
    .prepare("SELECT id, email, fund_ids, unsubscribe_token FROM subscribers WHERE status = 'active'")
    .all<SubscriberRow>();
  let sent = 0;

  for (const subscriber of result.results) {
    const selected = safeJson<string[]>(subscriber.fund_ids, []);
    if (!selected.includes(fund.id)) continue;
    const prior = await db
      .prepare("SELECT id FROM alert_deliveries WHERE subscriber_id = ? AND fund_id = ? AND accession = ?")
      .bind(subscriber.id, fund.id, filing.accession)
      .first<{ id: number }>();
    if (prior) continue;

    const unsubscribeUrl = `${runtime.PUBLIC_SITE_URL.replace(/\/$/, "")}/api/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribe_token)}`;
    const body = `<div style="max-width:640px;margin:auto;padding:32px;font-family:Arial,'Noto Sans SC',sans-serif;background:#f6f2e8;color:#122338">
      <p style="font-size:12px;letter-spacing:.12em;color:#167e70">持仓镜 · 13F变更提醒</p>
      <h1 style="font-size:28px;margin:8px 0">${escapeHtml(fund.nameZh)}发布新持仓</h1>
      <p style="color:#566577">${escapeHtml(filing.period)}，申报日 ${escapeHtml(filing.filedAt)}。以下为相对上一期公开13F的权重变化。</p>
      ${changeList("新进仓位", changes.added, "up")}
      ${changeList("退出仓位", changes.exited, "down")}
      ${changeList("主要增持", changes.increased, "up")}
      ${changeList("主要减持", changes.decreased, "down")}
      <p style="margin-top:28px"><a href="${runtime.PUBLIC_SITE_URL}" style="color:#087d6f">查看完整持仓 →</a></p>
      <p style="font-size:12px;color:#75808e;margin-top:28px">13F通常在季度结束后45天内披露，不能代表实时交易或完整投资组合。本邮件仅作信息研究，不构成投资建议。</p>
      <p style="font-size:12px"><a href="${unsubscribeUrl}" style="color:#75808e">退订提醒</a></p>
    </div>`;

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
          subject: `【持仓镜】${fund.nameZh} ${filing.period} 13F变更`,
          html: body,
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
      .prepare("INSERT OR IGNORE INTO alert_deliveries (subscriber_id, fund_id, accession, provider_id, status, error) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(subscriber.id, fund.id, filing.accession, providerId, status, error)
      .run();
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
  const results: Array<Record<string, unknown>> = [];
  for (const fund of funds) {
    try {
      const latest = await latestFiling(fund);
      const previous = await db
        .prepare("SELECT id, accession, data_json FROM fund_snapshots WHERE fund_id = ? ORDER BY id DESC LIMIT 1")
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
      const changes = previous ? summarizeChanges(previousRows, current) : {
        baseline: true,
        added: [],
        exited: [],
        increased: [],
        decreased: [],
      };
      await db
        .prepare("INSERT OR IGNORE INTO fund_snapshots (fund_id, accession, period, filed_at, data_json, change_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(fund.id, latest.accession, latest.period, latest.filedAt, JSON.stringify(current), JSON.stringify(changes))
        .run();
      const delivery = previous ? await sendAlerts(fund, latest, changes) : { sent: 0, emailStatus: "baseline" as const };
      results.push({ fundId: fund.id, status: previous ? "updated" : "seeded", accession: latest.accession, ...delivery });
    } catch (cause) {
      results.push({ fundId: fund.id, status: "error", error: cause instanceof Error ? cause.message : "刷新失败" });
    }
  }

  await db
    .prepare("INSERT INTO system_state (key, value, updated_at) VALUES ('last_refresh', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
    .bind(checkedAt)
    .run();
  return { skipped: false, checkedAt, results };
}
