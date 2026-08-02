import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { DELIVERY_CLAIM_SQL } from "../app/lib/alertDelivery.ts";

test("claims each alert once, retries failures, and preserves successful delivery", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE alert_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscriber_id INTEGER NOT NULL,
    fund_id TEXT NOT NULL,
    accession TEXT NOT NULL,
    provider_id TEXT,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (subscriber_id, fund_id, accession)
  )`);
  const claim = db.prepare(DELIVERY_CLAIM_SQL);

  assert.equal(claim.run(1, "scion", "0001").changes, 1);
  assert.equal(claim.run(1, "scion", "0001").changes, 0);

  db.prepare("UPDATE alert_deliveries SET status = 'failed' WHERE subscriber_id = 1").run();
  assert.equal(claim.run(1, "scion", "0001").changes, 1);

  db.prepare("UPDATE alert_deliveries SET status = 'sent' WHERE subscriber_id = 1").run();
  assert.equal(claim.run(1, "scion", "0001").changes, 0);

  assert.equal(claim.run(2, "scion", "0001").changes, 1);
  db.prepare("UPDATE alert_deliveries SET created_at = datetime('now', '-31 minutes') WHERE subscriber_id = 2").run();
  assert.equal(claim.run(2, "scion", "0001").changes, 1);

  db.close();
});
