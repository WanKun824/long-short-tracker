import assert from "node:assert/strict";
import test from "node:test";
import { summarizePublicSignals } from "../app/lib/deepseekDigest.ts";

const signal = {
  id: "signal-1",
  fundId: "atreides",
  kind: "media",
  sourceName: "Reuters",
  sourceUrl: "https://www.reuters.com/technology/example",
  title: "Atreides discusses the AI investment cycle",
  publishedAt: "2026-08-08T00:00:00.000Z",
  discoveredAt: "2026-08-08T01:00:00.000Z",
};

test("does not call DeepSeek when the encrypted credential is absent", async () => {
  let called = false;
  const result = await summarizePublicSignals([signal], {}, async () => {
    called = true;
    return new Response();
  });
  assert.equal(result, null);
  assert.equal(called, false);
});
test("uses deepseek-v4-flash JSON mode and rejects invented signal IDs", async () => {
  const result = await summarizePublicSignals([signal], {
    DEEPSEEK_API_KEY: "test-only",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com/",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
  }, async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "deepseek-v4-flash");
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.match(body.messages[1].content, /signal-1/);
    return Response.json({
      choices: [{ message: { content: JSON.stringify({
        headlineZh: "AI ????",
        overviewZh: "?????????????",
        items: [
          { signalId: "invented", titleZh: "????", summaryZh: "???", relevanceZh: "", materiality: "high" },
          { signalId: "signal-1", titleZh: "AI ????", summaryZh: "???????????", relevanceZh: "? Atreides ???", materiality: "medium" },
        ],
      }) } }],
    });
  });

  assert.equal(result.model, "deepseek-v4-flash");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].signalId, "signal-1");
});
