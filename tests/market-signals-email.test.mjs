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
      headlineZh: "AI ????",
      overviewZh: "??????????",
      items: [{
        signalId: "one",
        titleZh: "AI ?????",
        summaryZh: "???????? AI ???",
        relevanceZh: "? Atreides ????????",
        materiality: "medium",
      }],
    },
  });

  assert.match(email.subject, /PUBLIC|????/);
  assert.match(email.html, /AI &lt;cycle&gt; &amp; markets/);
  assert.match(email.html, /??SEC????/);
  assert.match(email.html, /?????????????/);
  assert.match(email.html, /https:\/\/www\.sec\.gov\/edgar\/search\//);
  assert.ok(!email.html.includes("AI <cycle>"));
  assert.match(email.html, /deepseek-v4-flash/);
  assert.match(email.html, /???????? AI ??/);
  assert.match(email.html, /????/);
});
