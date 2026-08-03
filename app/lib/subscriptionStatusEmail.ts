import type { Holding } from "../data/funds";

export type SubscriptionFundStatus = {
  fundId: string;
  fundName: string;
  period: string;
  filedAt: string;
  checkedAt: string | null;
  status: string;
  statusNote: string;
  holdings: Holding[];
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function holdingLabel(holding: Holding) {
  const option = holding.option ? ` ${holding.option}` : "";
  return `${holding.ticker}${option}`;
}

function fundCard(fund: SubscriptionFundStatus) {
  const topHoldings = [...fund.holdings]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 5);
  const checkedAt = fund.checkedAt
    ? `<span style="color:#777268">数据检查：${escapeHtml(fund.checkedAt.slice(0, 10))}</span>`
    : "";

  return `<section style="border-top:1px solid #d8d3c8;padding:22px 0">
    <div style="display:flex;justify-content:space-between;gap:16px;align-items:baseline">
      <h2 style="font-family:Georgia,'Noto Serif SC',serif;font-size:20px;line-height:1.3;margin:0;color:#11110f">${escapeHtml(fund.fundName)}</h2>
      <strong style="font-size:12px;color:#9b2f24;white-space:nowrap">${escapeHtml(fund.status)}</strong>
    </div>
    <p style="font-size:13px;color:#5f5b52;margin:8px 0 14px">${escapeHtml(fund.period)} · 申报日 ${escapeHtml(fund.filedAt)} ${checkedAt}</p>
    <p style="font-size:14px;line-height:1.7;color:#34312c;margin:0 0 14px">${escapeHtml(fund.statusNote)}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;color:#34312c">
      <tbody>${topHoldings.map((holding, index) => `<tr>
        <td style="padding:6px 0;border-top:1px solid #ece8df;color:#777268;width:28px">${index + 1}</td>
        <td style="padding:6px 0;border-top:1px solid #ece8df"><strong>${escapeHtml(holdingLabel(holding))}</strong><br><span style="color:#777268">${escapeHtml(holding.issuer)}</span></td>
        <td style="padding:6px 0;border-top:1px solid #ece8df;text-align:right;font-weight:700">${holding.weight.toFixed(1)}%</td>
      </tr>`).join("")}</tbody>
    </table>
  </section>`;
}

export function buildSubscriptionStatusEmail({
  funds,
  publicSiteUrl,
  unsubscribeToken,
}: {
  funds: SubscriptionFundStatus[];
  publicSiteUrl: string;
  unsubscribeToken: string;
}) {
  const siteUrl = publicSiteUrl.replace(/\/$/, "");
  const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const html = `<div style="margin:0;padding:32px 16px;background:#f3f0e9;color:#11110f;font-family:Arial,'Noto Sans SC',sans-serif">
    <main style="max-width:680px;margin:auto;background:#fff;padding:36px 34px;border:1px solid #ded9cf">
      <p style="font-size:11px;letter-spacing:.14em;color:#9b2f24;margin:0">LONG / SHORT TRACKER · SUBSCRIPTION STATUS</p>
      <h1 style="font-family:Georgia,'Noto Serif SC',serif;font-size:30px;line-height:1.2;margin:12px 0;color:#11110f">订阅确认与当前13F状态</h1>
      <p style="font-size:15px;line-height:1.8;color:#4f4b43;margin:0 0 24px">订阅已生效。以下是你所选机构目前最新的公开13F快照；出现新申报时，我们将继续发送新增、退出及主要增减持摘要。</p>
      ${funds.map(fundCard).join("")}
      <p style="margin:28px 0 0"><a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:11px 16px;background:#11110f;color:#fff;text-decoration:none;font-size:13px">查看完整持仓</a></p>
      <p style="font-size:12px;line-height:1.7;color:#777268;margin:28px 0 0">13F通常在季度结束后45天内披露，只覆盖特定美国上市证券，不能代表实时交易、普通股票空头或完整投资组合。本邮件仅作信息研究，不构成投资建议。</p>
      <p style="font-size:12px;margin:12px 0 0"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#777268">退订提醒</a></p>
    </main>
  </div>`;

  return {
    subject: `[LONG / SHORT TRACKER] 订阅确认与当前13F状态（${funds.length}家机构）`,
    html,
  };
}
