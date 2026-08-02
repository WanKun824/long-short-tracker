import assert from "node:assert/strict";
import test from "node:test";
import { buildAlertEmail, summarizeChanges } from "../app/lib/holdingChanges.ts";

function holding(ticker, cusip, weight, option = null) {
  return {
    ticker,
    issuer: `${ticker} issuer`,
    class: "COM",
    cusip,
    valueK: weight * 1_000,
    weight,
    shares: 100,
    principal: null,
    option,
  };
}

test("classifies material 13F changes and ignores sub-threshold noise", () => {
  const previous = [
    holding("ALPHA", "001", 10),
    holding("BETA", "002", 5),
    holding("NOISE", "003", 3),
    holding("EXIT", "004", 2),
  ];
  const current = [
    holding("ALPHA", "001", 10.3),
    holding("BETA", "002", 4.7),
    holding("NOISE", "003", 3.05),
    holding("NEW", "005", 7),
  ];

  const changes = summarizeChanges(previous, current);
  assert.deepEqual(changes.added.map((row) => row.ticker), ["NEW"]);
  assert.deepEqual(changes.exited.map((row) => row.ticker), ["EXIT"]);
  assert.deepEqual(changes.increased.map((row) => row.ticker), ["ALPHA"]);
  assert.deepEqual(changes.decreased.map((row) => row.ticker), ["BETA"]);
  assert.ok(!JSON.stringify(changes).includes("NOISE"));
});

test("builds a safe Chinese alert with disclosure and unsubscribe link", () => {
  const changes = {
    added: [{ ticker: "<script>alert(1)</script>", option: null, before: 0, after: 4.2 }],
    exited: [],
    increased: [],
    decreased: [],
  };
  const email = buildAlertEmail({
    fundName: "Scion & Partners",
    period: "2026 Q2",
    filedAt: "2026-08-14",
    changes,
    publicSiteUrl: "https://example.com/",
    unsubscribeToken: "a/b",
  });

  assert.match(email.subject, /13F数据库.*Scion & Partners.*2026 Q2/);
  assert.match(email.html, /新进仓位/);
  assert.match(email.html, /不构成投资建议/);
  assert.match(email.html, /https:\/\/example\.com\/api\/unsubscribe\?token=a%2Fb/);
  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.ok(!email.html.includes("<script>"));
});
