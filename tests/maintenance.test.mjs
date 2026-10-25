import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fetchLatestSecFiling, latestSubmission, parseInformationTableXml } from "../app/lib/sec13f.ts";
import { ACQUIRE_REFRESH_LOCK_SQL, expireStaleRefreshRuns } from "../app/lib/refreshLock.ts";
import { beforeDailyWindow } from "../app/lib/refreshSchedule.ts";
import { verifyResendWebhook } from "../app/lib/resendWebhook.ts";
import { PENDING_OUTBOX_SQL } from "../app/lib/alertDelivery.ts";

const submissions = (form, accession, period = "2026-06-30") => ({ filings: { recent: {
  form: [form], accessionNumber: [accession], reportDate: [period], filingDate: ["2026-08-14"],
} } });

test("follows a 13F notice to the reporting parent and retains the original manager scope", async () => {
  const responses = new Map([
    ["https://data.sec.gov/submissions/CIK0001336528.json", submissions("13F-NT", "0001172661-26-003777")],
    ["https://www.sec.gov/Archives/edgar/data/1336528/000117266126003777/primary_doc.xml", "<otherManager><cik>0002026053</cik></otherManager>"],
    ["https://data.sec.gov/submissions/CIK0002026053.json", submissions("13F-HR", "0001172661-26-003790")],
    ["https://www.sec.gov/Archives/edgar/data/2026053/000117266126003790/primary_doc.xml", "<otherManager2><sequenceNumber>1</sequenceNumber><otherManager><cik>0001336528</cik></otherManager></otherManager2>"],
  ]);
  const filing = await fetchLatestSecFiling("0001336528", async (url) => {
    assert.ok(responses.has(String(url)), `Unexpected SEC request: ${url}`);
    const value = responses.get(String(url));
    return typeof value === "string" ? new Response(value) : Response.json(value);
  });
  assert.equal(filing.reportingCik, "0002026053");
  assert.equal(filing.period, "2026 Q2");
  assert.equal(filing.accession, "000117266126003790");
  assert.deepEqual(filing.managerNumbers, ["1"]);
});

test("does not mistake a late amendment of an older quarter for the latest quarter", () => {
  const filing = latestSubmission({ filings: { recent: {
    form: ["13F-HR/A", "13F-NT"],
    accessionNumber: ["0001172661-26-004000", "0001172661-26-003777"],
    reportDate: ["2026-03-31", "2026-06-30"],
    filingDate: ["2026-09-01", "2026-08-14"],
  } } });
  assert.equal(filing.form, "13F-NT");
});

test("excludes other subsidiaries' holdings from a parent report", () => {
  const item = (cusip, manager, value) => `<infoTable><nameOfIssuer>Issuer</nameOfIssuer><cusip>${cusip}</cusip><value>${value}</value><otherManager>${manager}</otherManager></infoTable>`;
  const rows = parseInformationTableXml(item("111111111", "1, 2, 3", 1000000) + item("222222222", "3, 4, 5", 9000000), [], ["1"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cusip, "111111111");
  assert.equal(rows[0].valueK, 1000);
});

test("a refresh lease blocks concurrent owners and can be recovered only after expiry", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE refresh_locks (name TEXT PRIMARY KEY, owner TEXT, expires_at INTEGER)");
  const claim = db.prepare(ACQUIRE_REFRESH_LOCK_SQL);
  assert.equal(claim.run("one", 1000, 0).changes, 1);
  assert.equal(claim.run("two", 1500, 500).changes, 0);
  assert.equal(claim.run("two", 2000, 1000).changes, 1);
  assert.equal(db.prepare("DELETE FROM refresh_locks WHERE owner = ?").run("one").changes, 0);
  db.close();
});

test("expires interrupted runs without changing a live run", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE refresh_runs (status TEXT, started_at TEXT, completed_at TEXT, error TEXT, reason TEXT);
    INSERT INTO refresh_runs(status, started_at) VALUES ('running', datetime('now','-21 minutes')), ('running', datetime('now'));`);
  await expireStaleRefreshRuns({ prepare: (sql) => ({ run: async () => db.prepare(sql).run() }) });
  assert.deepEqual(db.prepare("SELECT status FROM refresh_runs ORDER BY started_at").all().map(r => r.status), ["timed_out", "running"]);
  db.close();
});

test("ordinary manual checks cannot consume the calendar-day check before 08:00 Hong Kong", () => {
  assert.equal(beforeDailyWindow(Date.parse("2026-10-21T20:56:00Z")), true);
  assert.equal(beforeDailyWindow(Date.parse("2026-10-22T00:00:00Z")), false);
});

test("retries a persisted digest with no new news and excludes successful or unsubscribed deliveries", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE subscribers (id INTEGER PRIMARY KEY, email TEXT, status TEXT);
    CREATE TABLE email_outbox (subscriber_id INTEGER, fund_id TEXT, accession TEXT, subject TEXT, html TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE alert_deliveries (id INTEGER PRIMARY KEY, subscriber_id INTEGER, fund_id TEXT, accession TEXT, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO subscribers VALUES (1,'one@example.test','active'),(2,'two@example.test','active'),(3,'three@example.test','unsubscribed');
    INSERT INTO email_outbox(subscriber_id,fund_id,accession,subject,html) VALUES
      (1,'__signals__','digest-old','Saved digest','Saved body'),(2,'__signals__','digest-old','Saved digest','Saved body'),(3,'__signals__','digest-old','Saved digest','Saved body');
    INSERT INTO alert_deliveries(id,subscriber_id,fund_id,accession,status) VALUES
      (1,1,'__signals__','digest-old','failed'),(2,2,'__signals__','digest-old','sent'),(3,3,'__signals__','digest-old','failed');`);
  const pending = db.prepare(PENDING_OUTBOX_SQL).all();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].subscriber_id, 1);
  assert.equal(pending[0].html, "Saved body");
  db.close();
});

test("accepts a signed Resend event and rejects changed bodies and replayed timestamps", async () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  const body = '{"type":"email.delivered"}';
  const keyBytes = new TextEncoder().encode("a-webhook-test-key-with-enough-bytes");
  const secret = "whsec_" + Buffer.from(keyBytes).toString("base64");
  const timestamp = String(now / 1000);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`event-1.${timestamp}.${body}`));
  const headers = new Headers({ "svix-id": "event-1", "svix-timestamp": timestamp, "svix-signature": "v1," + Buffer.from(signature).toString("base64") });
  assert.equal(await verifyResendWebhook(body, headers, secret, now), true);
  assert.equal(await verifyResendWebhook(body + " ", headers, secret, now), false);
  assert.equal(await verifyResendWebhook(body, headers, secret, now + 301000), false);
});
