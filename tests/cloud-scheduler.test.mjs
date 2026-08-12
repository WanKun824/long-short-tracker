import assert from "node:assert/strict";
import test from "node:test";
import { RefreshAuditError, runScheduledRefresh, sendSchedulerFailureAlert } from "../worker/cloudScheduler.ts";

function successfulPayload(overrides = {}) {
  return {
    skipped: false,
    checkedAt: "2026-08-04T00:00:00.000Z",
    pendingAlertRetry: { sent: 0, failed: 0, emailStatus: "configured" },
    results: Array.from({ length: 8 }, (_, index) => ({
      fundId: `fund-${index + 1}`,
      status: index === 0 ? "updated" : "unchanged",
      sent: index === 0 ? 2 : 0,
      failed: 0,
      emailStatus: index === 0 ? "configured" : undefined,
    })),
    publicSignals: { newCount: 1, errors: [] },
    publicSignalDelivery: { sent: 1, failed: 0, emailStatus: "configured" },
    ...overrides,
  };
}

test("cloud scheduler calls the refresh handler in-process and audits all eight funds", async () => {
  let received;
  const audit = await runScheduledRefresh(Date.parse("2026-08-12T00:00:00Z"), async (request) => {
    received = request;
    return Response.json(successfulPayload());
  });

  assert.equal(received.url, "https://long-short-tracker.internal/api/refresh");
  assert.equal(received.method, "POST");
  assert.equal(received.headers.get("x-scheduled-time"), "2026-08-12T00:00:00.000Z");
  assert.deepEqual(audit, {
    skipped: false,
    checkedAt: "2026-08-04T00:00:00.000Z",
    fundChecks: 8,
    updatedFunds: ["fund-1"],
    publicSignalCount: 1,
    emailsSent: 3,
  });
});

test("cloud scheduler accepts an intentional same Hong Kong day response", async () => {
  const audit = await runScheduledRefresh(Date.now(), async () => Response.json({
    skipped: true,
    reason: "already_checked_today",
    checkedAt: "2026-08-04T00:00:00.000Z",
  }));
  assert.equal(audit.skipped, true);
});

test("cloud scheduler fails an incomplete fund audit", async () => {
  await assert.rejects(
    runScheduledRefresh(Date.now(), async () => Response.json(successfulPayload({
      results: successfulPayload().results.slice(0, 7),
    }))),
    (error) => error instanceof RefreshAuditError && /预期 8 家/.test(error.message),
  );
});

test("cloud scheduler fails on consecutive source or email delivery errors", async () => {
  await assert.rejects(
    runScheduledRefresh(Date.now(), async () => Response.json(successfulPayload({
      publicSignals: { newCount: 0, errors: [{ fundId: "scion", sources: ["RSS 500"], errorStreak: 2 }] },
      publicSignalDelivery: { sent: 0, failed: 1, emailStatus: "configured" },
    }))),
    (error) => error instanceof RefreshAuditError
      && /连续信源错误/.test(error.message)
      && /邮件投递失败/.test(error.message),
  );
});

test("cloud scheduler treats HTTP authentication failures as non-retryable", async () => {
  await assert.rejects(
    runScheduledRefresh(Date.now(), async () => Response.json({ error: "unauthorized" }, { status: 401 })),
    (error) => error instanceof RefreshAuditError && error.noRetry && /unauthorized/.test(error.message),
  );
});

test("cloud scheduler sends an idempotent operations email only for a handled failure", async () => {
  let received;
  const result = await sendSchedulerFailureAlert({
    RESEND_API_KEY: "resend-test",
    ALERT_FROM_EMAIL: "Tracker <alerts@example.test>",
    OPERATIONS_ALERT_EMAIL: "owner@example.test",
  }, {
    cron: "0 */12 * * *",
    scheduledTime: Date.parse("2026-08-04T12:00:00Z"),
    error: "2 家机构刷新失败 <check>",
  }, async (input, init) => {
    received = { input: String(input), init };
    return Response.json({ id: "email-1" });
  });

  const headers = new Headers(received.init.headers);
  const body = JSON.parse(received.init.body);
  assert.equal(received.input, "https://api.resend.com/emails");
  assert.equal(headers.get("Idempotency-Key"), `cloud-refresh-failure/${Date.parse("2026-08-04T12:00:00Z")}`);
  assert.deepEqual(body.to, ["owner@example.test"]);
  assert.match(body.html, /&lt;check&gt;/);
  assert.doesNotMatch(body.html, /<check>/);
  assert.deepEqual(result, { sent: true, providerId: "email-1" });
});
