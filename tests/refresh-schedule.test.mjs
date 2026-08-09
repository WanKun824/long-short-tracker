import assert from "node:assert/strict";
import test from "node:test";
import { alreadyCheckedOnHongKongDate, hongKongDateKey } from "../app/lib/refreshSchedule.ts";

test("uses Hong Kong calendar dates across UTC midnight", () => {
  assert.equal(hongKongDateKey("2026-08-08T15:59:59.999Z"), "2026-08-08");
  assert.equal(hongKongDateKey("2026-08-08T16:00:00.000Z"), "2026-08-09");
});

test("skips only when the last complete refresh is on the same Hong Kong date", () => {
  const scheduledAt = Date.parse("2026-08-09T00:00:00.000Z");
  assert.equal(alreadyCheckedOnHongKongDate("2026-08-08T15:59:59.999Z", scheduledAt), false);
  assert.equal(alreadyCheckedOnHongKongDate("2026-08-08T16:00:00.000Z", scheduledAt), true);
  assert.equal(alreadyCheckedOnHongKongDate("2026-08-09T07:59:59.999Z", scheduledAt), true);
});
