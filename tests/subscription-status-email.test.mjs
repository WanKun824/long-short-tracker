import assert from "node:assert/strict";
import test from "node:test";
import { buildSubscriptionStatusEmail } from "../app/lib/subscriptionStatusEmail.ts";

test("builds a safe current-status email for a new subscription", () => {
  const email = buildSubscriptionStatusEmail({
    funds: [{
      fundId: "scion",
      fundName: "Scion & Partners",
      period: "2025 Q3",
      filedAt: "2025-11-03",
      checkedAt: "2026-08-04T08:00:00.000Z",
      status: "申报已终止",
      statusNote: "公开13F目前停留在该季度。",
      holdings: [{
        ticker: "<NVDA>",
        issuer: "Nvidia & Co.",
        class: "COM",
        cusip: "001",
        valueK: 100,
        weight: 12.3,
        shares: 10,
        principal: null,
        option: null,
      }],
    }],
    publicSiteUrl: "https://example.com/",
    unsubscribeToken: "a/b",
  });

  assert.match(email.subject, /订阅确认与当前13F状态（1家机构）/);
  assert.match(email.html, /Scion &amp; Partners/);
  assert.match(email.html, /&lt;NVDA&gt;/);
  assert.match(email.html, /13F通常在季度结束后45天内披露/);
  assert.match(email.html, /https:\/\/example\.com\/api\/unsubscribe\?token=a%2Fb/);
  assert.ok(!email.html.includes("<NVDA>"));
});
