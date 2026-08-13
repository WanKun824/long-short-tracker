import assert from "node:assert/strict";
import test from "node:test";
import {
  adminSessionCookie,
  createAdminSession,
  isAdminRequest,
  verifyAdminPassword,
} from "../app/lib/adminAccess.ts";

test("verifies the configured password without accepting close values", async () => {
  assert.equal(await verifyAdminPassword("correct horse", "correct horse"), true);
  assert.equal(await verifyAdminPassword("correct Horse", "correct horse"), false);
  assert.equal(await verifyAdminPassword("", "correct horse"), false);
  assert.equal(await verifyAdminPassword("correct horse", undefined), false);
});

test("accepts only a valid unexpired signed admin session", async () => {
  const secret = "test-secret-that-is-long-enough";
  const issuedAt = Date.parse("2026-08-13T00:00:00Z");
  const token = await createAdminSession(secret, issuedAt);
  const cookie = adminSessionCookie(token).split(";", 1)[0];
  const authenticated = new Headers({ cookie });
  const tampered = new Headers({ cookie: `${cookie}x` });

  assert.equal(await isAdminRequest(authenticated, secret, issuedAt + 1_000), true);
  assert.equal(await isAdminRequest(tampered, secret, issuedAt + 1_000), false);
  assert.equal(await isAdminRequest(authenticated, "wrong-secret", issuedAt + 1_000), false);
  assert.equal(await isAdminRequest(authenticated, secret, issuedAt + 25 * 60 * 60 * 1_000), false);
});
