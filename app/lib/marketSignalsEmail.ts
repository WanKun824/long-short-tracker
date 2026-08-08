import type { FundProfile } from "../data/funds";
import type { DeepSeekDigest } from "./deepseekDigest";
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
  if (kind === "official") return "??";
  if (kind === "social") return "?? X";
  return "????";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toISOString().slice(0, 10);
}

function materialityLabel(value: "high" | "medium" | "low") {
  if (value === "high") return "??";
  if (value === "medium") return "??";
  return "??";
}

function sectionHtml(section: SignalEmailSection, digest?: DeepSeekDigest | null) {
  const signals = [...section.signals]
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 6);
  const references = section.officialSources
    .map((source) => `<a href="${escapeEmailHtml(source.url)}" style="color:#777268;margin-right:12px">${escapeEmailHtml(source.name)}</a>`)
    .join("");

  return `<section style="border-top:1px solid #d8d3c8;padding:22px 0">
    <h2 style="font-family:Georgia,'Noto Serif SC',serif;font-size:20px;line-height:1.3;margin:0 0 14px;color:#11110f">${escapeEmailHtml(section.fundName)}</h2>
    ${signals.map((signal) => {
      const summary = digest?.items.find((item) => item.signalId === signal.id);
      return `<article style="border-top:1px solid #ece8df;padding:12px 0">
      <p style="font-size:11px;letter-spacing:.06em;color:#9b2f24;margin:0 0 5px">${signalLabel(signal.kind)} ? ${escapeEmailHtml(signal.sourceName)} ? ${escapeEmailHtml(dateLabel(signal.publishedAt))}</p>
      <a href="${escapeEmailHtml(signal.sourceUrl)}" style="font-family:Georgia,'Noto Serif SC',serif;font-size:16px;line-height:1.55;color:#11110f;text-decoration:none">${escapeEmailHtml(summary?.titleZh || signal.title)}</a>
      ${summary ? `<p style="font-size:13px;line-height:1.7;color:#4f4b43;margin:7px 0 0">${escapeEmailHtml(summary.summaryZh)}</p>
        ${summary.relevanceZh ? `<p style="font-size:12px;line-height:1.65;color:#777268;margin:5px 0 0"><strong>${materialityLabel(summary.materiality)}?</strong>${escapeEmailHtml(summary.relevanceZh)}</p>` : ""}` : ""}
      <p style="font-size:11px;line-height:1.5;color:#9a958b;margin:6px 0 0">?????${escapeEmailHtml(signal.title)}</p>
    </article>`;
    }).join("")}
    ${references ? `<p style="font-size:12px;line-height:1.7;color:#777268;margin:10px 0 0">???????${references}</p>` : ""}
  </section>`;
}

export function buildMarketSignalsEmail({
  sections,
  publicSiteUrl,
  unsubscribeToken,
  digest,
}: {
  sections: SignalEmailSection[];
  publicSiteUrl: string;
  unsubscribeToken: string;
  digest?: DeepSeekDigest | null;
}) {
  const siteUrl = publicSiteUrl.replace(/\/$/, "");
  const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const count = sections.reduce((sum, section) => sum + section.signals.length, 0);
  const html = `<div style="margin:0;padding:32px 16px;background:#f3f0e9;color:#11110f;font-family:Arial,'Noto Sans SC',sans-serif">
    <main style="max-width:680px;margin:auto;background:#fff;padding:36px 34px;border:1px solid #ded9cf">
      <p style="font-size:11px;letter-spacing:.14em;color:#9b2f24;margin:0">LONG / SHORT TRACKER ? PUBLIC CONTEXT</p>
      <h1 style="font-family:Georgia,'Noto Serif SC',serif;font-size:30px;line-height:1.2;margin:12px 0;color:#11110f">${escapeEmailHtml(digest?.headlineZh || "????????")}</h1>
      <p style="font-size:15px;line-height:1.8;color:#4f4b43;margin:0 0 24px">????????????????? X ??????????????????SEC????????????</p>
      ${digest?.overviewZh ? `<p style="font-family:Georgia,'Noto Serif SC',serif;font-size:16px;line-height:1.75;color:#34312c;margin:0 0 24px;padding:16px 18px;background:#f7f5f0;border-left:3px solid #9b2f24">${escapeEmailHtml(digest.overviewZh)}</p>` : ""}
      ${sections.map((section) => sectionHtml(section, digest)).join("")}
      <p style="margin:28px 0 0"><a href="${escapeEmailHtml(siteUrl)}" style="display:inline-block;padding:11px 16px;background:#11110f;color:#fff;text-decoration:none;font-size:13px">??LONG / SHORT TRACKER</a></p>
      ${digest ? `<p style="font-size:11px;line-height:1.6;color:#9a958b;margin:20px 0 0">??? ${escapeEmailHtml(digest.model)} ?????????????????????????????</p>` : ""}
      <p style="font-size:12px;line-height:1.7;color:#777268;margin:28px 0 0"><strong>?????</strong>????????SEC???????????????????????????????????<a href="https://www.sec.gov/edgar/search/" style="color:#777268">SEC EDGAR????</a>???13F???????????????????????????</p>
      <p style="font-size:12px;margin:12px 0 0"><a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#777268">????</a></p>
    </main>
  </div>`;

  return {
    subject: `[LONG / SHORT TRACKER] ?????????${count}??`,
    html,
  };
}
