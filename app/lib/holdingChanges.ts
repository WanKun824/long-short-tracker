import type { Holding } from "../data/funds";

export type ChangeItem = {
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

function holdingKey(row: Holding) {
  return `${row.cusip}|${row.option ?? "SHARES"}`;
}

export function summarizeChanges(previous: Holding[], current: Holding[]): HoldingChanges {
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
  return `<h3 style="margin:24px 0 8px;color:#11110f">${title}</h3><ul style="margin:0;padding-left:20px;color:#49463f">${rows
    .slice(0, 8)
    .map((row) => `<li>${escapeHtml(row.ticker)}${row.option ? ` ${row.option}` : ""}：${row.before.toFixed(1)}% ${direction === "up" ? "→" : "→"} ${row.after.toFixed(1)}%</li>`)
    .join("")}</ul>`;
}

export function buildAlertEmail({
  fundName,
  period,
  filedAt,
  changes,
  publicSiteUrl,
  unsubscribeToken,
}: {
  fundName: string;
  period: string;
  filedAt: string;
  changes: HoldingChanges;
  publicSiteUrl: string;
  unsubscribeToken: string;
}) {
  const siteUrl = publicSiteUrl.replace(/\/$/, "");
  const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const safeFundName = escapeHtml(fundName);
  const html = `<div style="max-width:640px;margin:auto;padding:32px;font-family:Arial,'Noto Sans SC',sans-serif;background:#f5f1e8;color:#11110f">
    <p style="font-size:12px;letter-spacing:.12em;color:#9b2f24">LONG / SHORT TRACKER · 申报更新</p>
    <h1 style="font-size:28px;margin:8px 0">${safeFundName}发布新持仓</h1>
    <p style="color:#5f5b52">${escapeHtml(period)}，申报日 ${escapeHtml(filedAt)}。以下为相对上一期公开13F的权重变化。</p>
    ${changeList("新进仓位", changes.added, "up")}
    ${changeList("退出仓位", changes.exited, "down")}
    ${changeList("主要增持", changes.increased, "up")}
    ${changeList("主要减持", changes.decreased, "down")}
    <p style="margin-top:28px"><a href="${escapeHtml(siteUrl)}" style="color:#9b2f24">查看完整持仓 →</a></p>
    <p style="font-size:12px;color:#777268;margin-top:28px">13F通常在季度结束后45天内披露，不能代表实时交易或完整投资组合。本邮件仅作信息研究，不构成投资建议。</p>
    <p style="font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#777268">退订提醒</a></p>
  </div>`;

  return {
    subject: `[LONG / SHORT TRACKER] ${fundName} ${period} 申报更新`,
    html,
  };
}
