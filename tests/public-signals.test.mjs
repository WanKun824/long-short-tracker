import assert from "node:assert/strict";
import test from "node:test";
import { parseGdeltArticles, parseTrustedRss, parseXPosts } from "../app/lib/publicSignalParsers.ts";
import { researchSources } from "../app/data/researchSources.ts";

test("keeps only allowlisted official or financial-news domains", () => {
  const profile = researchSources.find((item) => item.fundId === "pershing-square");
  assert.ok(profile);
  const rows = parseGdeltArticles({ articles: [
    { url: "https://www.reuters.com/markets/story?utm_source=test", title: "Ackman update", seendate: "20260804T010203Z" },
    { url: "https://random-blog.example/post", title: "Unsupported", seendate: "20260804T010203Z" },
    { url: "https://pershingsquareinc.com/news", title: "Official note", seendate: "20260803T010203Z" },
  ] }, profile);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.url === "https://www.reuters.com/markets/story"));
  assert.ok(rows.some((row) => row.domain === "pershingsquareinc.com"));
});

test("builds links only for posts returned by a confirmed official account query", () => {
  const rows = parseXPosts({ data: [{
    id: "12345",
    text: "A public update <not a position>",
    created_at: "2026-08-04T02:03:04.000Z",
  }] }, "BillAckman", "pershing-square");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "social");
  assert.equal(rows[0].sourceUrl, "https://x.com/BillAckman/status/12345");
});

test("parses recent items only from the declared direct media feed domain", () => {
  const now = new Date().toUTCString();
  const rows = parseTrustedRss(`<rss><channel>
    <item><title>Warren Buffett &amp; Berkshire update</title><link>https://www.nytimes.com/2026/08/04/business/example.html</link><pubDate>${now}</pubDate></item>
    <item><title>Wrong domain</title><link>https://example.com/story</link><pubDate>${now}</pubDate></item>
  </channel></rss>`, {
    domain: "nytimes.com",
    name: "The New York Times",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Warren Buffett & Berkshire update");
});
