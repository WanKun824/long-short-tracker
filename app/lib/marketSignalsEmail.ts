import type { FundProfile } from "../data/funds";
import type { PublicSignal } from "./publicSignals";

export type SignalEmailSection = {
  fundId: FundProfile["id"];
  fundName: string;
  signals: PublicSignal[];
  officialSources: Array<{ name: string; url: string }>;
};

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function signalLabel(kind: PublicSignal["kind"]) {
  if (kind === "official") return "官网";
  if (kind === "social") return "官方 X";
  return "财经媒体";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toISOString().slice(0, 10);
}

function sectionHtml(section: SignalEmailSection) {
  const signals = [...section.signals]
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 6);
  const references = section.officialSources
    .map((source) => `<a href="${escapeEmailHtml(source.url)}" style="color:#777268;margin-right:12px">${escapeEmailHtml(source.name)}</a>`)
    .join("");

  return `<section style="border-top:1px solid #d8d3c8;padding:22px 0">
    <h2 style="font-family:Georgia,'Noto Serif SC',serif;font-size:20px;line-height:1.3;margin:0 0 14px;color:#11110f">${escapeEmailHtml(section.fundName)}</h2>
    ${signals.map((signal) => `<article style="border-top:1px solid #ece8df;padding:12px 0">
      <p style="font-size:11px;letter-spacing:.06em;color:#9b2f24;margin:0 0 5px">${signalLabel(signal.kind)} · ${escapeEmailHtml(signal.sourceName)} · ${escapeEmailHtml(dateLabel(signal.publishedAt))}</p>
      <a href="${escapeEmailHtml(signal.sourceUrl)}" style="font-family:Georgia,'Noto Serif SC',serif;font-size:16px;line-height:1.55;color:#11110f;text-decoration:none">${escapeEmailHtml(signal.title)}</a>
    </article>`).join("")}
    ${references ? `<p style="font-size:12px;line-height:1.7;color:#777268;margin:10px 0 0">机构参考信源：${references}</p>` : ""}
  </section>`;
}

export function buildMarketSignalsEmail({
  sections,
  publicSiteUrl,
  unsubscribeToken,
}: {
  sections: SignalEmailSection[];
  publicSiteUrl: string;
  unsubscribeToken: string;
}) {
  const siteUrl = publicSiteUrl.replace(/\/$/, "");
  const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const count = sections.reduce((sum, section) => sum + section.signals.length, 0);
  const html = `<div style="margin:0;padding:32px 16px;background:#f3f0e9;color:#11110f;font-family:Arial,'Noto Sans SC',sans-serif">
    <main style="max-width:680px;margin:auto;background:#fff;padding:36px 34px;border:1px solid #ded9cf">
      <p style="font-size:11px;letter-spacing:.14em;color:#9b2f24;margin:0">LONG / SHORT TRACKER · PUBLIC CONTEXT</p>
      <h1 style="font-family:Georgia,'Noto Serif SC',serif;font-size:30px;line-height:1.2;margin:12px 0;color:#11110f">近期公开动态摘要</h1>
      <p style="font-size:15px;line-height:1.8;color:#4f4b43;margin:0 0 24px">以下内容来自机构官网、已确认的官方 X 账号或筛选后的主流财经媒体，用于补充SEC延迟披露之间的公开背景。</p>
      ${sections.map(sectionHtml).join("")}
      <p style="margin:28px 0 0"><a href="${escapeEmailHtml(siteUrl)}" style="display:inline-block;padding:11px 16px;background:#11110f;color:#fff;text-decoration:none;font-size:13px">查看LONG / SHORT TRACKER</a></p>
      <p style="font-size:12px;line-height:1.7;color:#777268;margin:28px 0 0"><strong>信息边界：</strong>上述公开动态不是SEC持仓数据，不能据此推断机构的实时买卖、空头或完整投资组合。持仓变化只以<a href="https://www.sec.gov/edgar/search/" style="color:#777268">SEC EDGAR原始申报</a>为准；13F本身通常延迟披露。本邮件仅作信息研究，不构成投资建议。</p>
      <p style="font-size:12px;margin:12px 0 0"><a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#777268">退订提醒</a></p>
    </main>
  </div>`;

  return {
    subject: `[LONG / SHORT TRACKER] 近期公开动态摘要（${count}条）`,
    html,
  };
}
