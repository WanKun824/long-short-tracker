import { ensureDbSchema, getD1, getRuntimeEnv } from "../../../../db";
import {
  adminSessionCookie,
  createAdminSession,
  loginAttemptKey,
  verifyAdminPassword,
} from "../../../lib/adminAccess";

const MAX_BODY_BYTES = 2_048;
const MAX_FAILURES = 5;

function adminRedirect(request: Request, error?: "invalid" | "locked" | "unavailable") {
  const url = new URL("/admin", request.url);
  if (error) url.searchParams.set("error", error);
  return new Response(null, {
    status: 303,
    headers: { location: url.toString() },
  });
}

async function readBoundedBody(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel("request body too large");
      throw new Error("request body too large");
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

export async function POST(request: Request) {
  const runtime = getRuntimeEnv();
  if (!runtime.ADMIN_PASSWORD || !runtime.ADMIN_SESSION_SECRET) {
    return adminRedirect(request, "unavailable");
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
      return adminRedirect(request, "invalid");
    }

    await ensureDbSchema();
    const db = getD1();
    const attemptKey = await loginAttemptKey(request.headers, runtime.ADMIN_SESSION_SECRET);
    const prior = await db.prepare("SELECT failures FROM admin_login_attempts WHERE attempt_key = ?")
      .bind(attemptKey)
      .first<{ failures: number }>();
    if (Number(prior?.failures ?? 0) >= MAX_FAILURES) return adminRedirect(request, "locked");

    const body = await readBoundedBody(request);
    const password = new URLSearchParams(body).get("password") ?? "";
    const valid = password.length <= 256
      && await verifyAdminPassword(password, runtime.ADMIN_PASSWORD);

    if (!valid) {
      await db.prepare(`INSERT INTO admin_login_attempts (attempt_key, failures, updated_at)
        VALUES (?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(attempt_key) DO UPDATE SET
          failures = admin_login_attempts.failures + 1,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(attemptKey)
        .run();
      return adminRedirect(request, "invalid");
    }

    const session = await createAdminSession(runtime.ADMIN_SESSION_SECRET);
    await db.batch([
      db.prepare("DELETE FROM admin_login_attempts WHERE attempt_key = ?").bind(attemptKey),
      db.prepare("DELETE FROM admin_login_attempts WHERE datetime(updated_at) < datetime('now', '-1 day')"),
    ]);
    const response = adminRedirect(request);
    response.headers.set("set-cookie", adminSessionCookie(session));
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (cause) {
    console.error(JSON.stringify({
      event: "admin_login_failed",
      error: cause instanceof Error ? cause.message : "unknown",
    }));
    return adminRedirect(request, "unavailable");
  }
}
