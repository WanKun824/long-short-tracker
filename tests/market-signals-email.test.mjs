import assert from "node:assert/strict";
import test from "node:test";
import { buildMarketSignalsEmail } from "../app/lib/marketSignalsEmail.ts";

test("separates public context from SEC holdings and escapes source content", () => {
  const email = buildMarketSignalsEmail({
    sections: [{
      fundId: "atreides",
      fundName: "Atreides & Co",
      officialSources: [{ name: "Official", url: "https://atreidesmgmt.com/" }],
      signals: [{
        id: "one",
        fundId: "atreides",
        kind: "social",
        sourceName: "@GavinSBaker",
        sourceUrl: "https://x.com/GavinSBaker/status/1?a=1&b=2",
        title: "AI <cycle> & markets",
        publishedAt: "2026-08-04T00:00:00.000Z",
        discoveredAt: "2026-08-04T01:00:00.000Z",
      }],
    }],
    publicSiteUrl: "https://example.com/",
    unsubscribeToken: "a/b",
    digest: {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      headlineZh: "AI 公开动态",
      overviewZh: "仅根据所列标题整理。",
      items: [{
        signalId: "one",
        titleZh: "AI 周期与市场",
        summaryZh: "该公开动态讨论了 AI 周期。",
        relevanceZh: "与 Atreides 的公开讨论有关。",
        materiality: "medium",
      }],
    },
  });

  assert.match(email.subject, /PUBLIC|公开动态/);
  assert.match(email.html, /AI &lt;cycle&gt; &amp; markets/);
  assert.match(email.html, /不是SEC持仓数据/);
  assert.match(email.html, /不能据此推断机构的实时买卖/);
  assert.match(email.html, /https:\/\/www\.sec\.gov\/edgar\/search\//);
  assert.ok(!email.html.includes("AI <cycle>"));
  assert.match(email.html, /deepseek-v4-flash/);
  assert.match(email.html, /该公开动态讨论了 AI 周期/);
  assert.match(email.html, /原始标题/);
});
