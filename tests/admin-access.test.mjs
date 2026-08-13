import assert from "node:assert/strict";
import test from "node:test";
import { getAdminEmails, getAuthenticatedEmail, isAdminRequest } from "../app/lib/adminAccess.ts";

test("allows only an authenticated configured administrator", () => {
  const allowed = "owner@example.com, second@example.com";
  const owner = new Headers({
    "oai-authenticated-user-id": "user-1",
    "oai-authenticated-user-email": "Owner@Example.com",
  });
  const stranger = new Headers({
    "oai-authenticated-user-id": "user-2",
    "oai-authenticated-user-email": "other@example.com",
  });
  const spoofed = new Headers({ "oai-authenticated-user-email": "owner@example.com" });
  const cloudflareOwner = new Headers({
    "cf-access-jwt-assertion": "signed-access-token",
    "cf-access-authenticated-user-email": "Owner@Example.com",
  });
  const spoofedCloudflareEmail = new Headers({
    "cf-access-authenticated-user-email": "owner@example.com",
  });

  assert.deepEqual([...getAdminEmails(allowed)], ["owner@example.com", "second@example.com"]);
  assert.equal(getAuthenticatedEmail(owner), "owner@example.com");
  assert.equal(isAdminRequest(owner, allowed), true);
  assert.equal(isAdminRequest(stranger, allowed), false);
  assert.equal(isAdminRequest(spoofed, allowed), false);
  assert.equal(getAuthenticatedEmail(cloudflareOwner), "owner@example.com");
  assert.equal(isAdminRequest(cloudflareOwner, allowed), true);
  assert.equal(isAdminRequest(spoofedCloudflareEmail, allowed), false);
});
