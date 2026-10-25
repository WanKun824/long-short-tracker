import { ensureDbSchema, getD1, getRuntimeEnv } from "../../../db";
import { isAdminRequest, verifyAdminPassword } from "../../lib/adminAccess";
import { refreshHoldings } from "../../lib/refreshHoldings";
import { ACQUIRE_REFRESH_LOCK_SQL, expireStaleRefreshRuns } from "../../lib/refreshLock";
import { readBoundedText } from "../../lib/sec13f";
import { completeRefreshRun, failRefreshRun, startRefreshRun, type RefreshRunContext } from "../../lib/refreshRunHistory";

export async function executeRefresh(request: Request, options: { scheduledTime?: number; force?: boolean; notify?: boolean } = {}) {
  let run: RefreshRunContext | null = null;
  let owner: string | null = null;
  try {
    await ensureDbSchema();
    const db = getD1();
    await expireStaleRefreshRuns(db);
    const internalRequest = new Request(request.url, { method: "POST", headers: new Headers(request.headers) });
    internalRequest.headers.delete("x-scheduled-time");
    if (options.scheduledTime !== undefined) internalRequest.headers.set("x-scheduled-time", new Date(options.scheduledTime).toISOString());
    run = await startRefreshRun(internalRequest);
    const now = Date.now();
    const claim = await db.prepare(ACQUIRE_REFRESH_LOCK_SQL).bind(run.id, now + 15 * 60_000, now).run();
    if (Number(claim.meta.changes ?? 0) === 0) {
      const result = { skipped: true, reason: "refresh_in_progress" };
      await completeRefreshRun(run, result);
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }
    owner = run.id;
    const result = await refreshHoldings({ force: options.force, notify: options.notify });
    await completeRefreshRun(run, result);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    if (run) {
      try {
        await failRefreshRun(run, cause);
      } catch (historyCause) {
        console.error(JSON.stringify({
          event: "refresh_history_write_failed",
          error: historyCause instanceof Error ? historyCause.message : "未知错误",
        }));
      }
    }
    const message = cause instanceof Error ? cause.message : "刷新服务暂不可用";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    if (owner) await getD1().prepare("DELETE FROM refresh_locks WHERE name = 'daily_refresh' AND owner = ?").bind(owner).run();
  }
}

export async function POST(request: Request) {
  const runtime = getRuntimeEnv();
  const secretAuthenticated = await verifyAdminPassword(request.headers.get("x-refresh-secret") ?? "", runtime.REFRESH_SECRET);
  const adminAuthenticated = await isAdminRequest(request.headers, runtime.ADMIN_SESSION_SECRET);
  if (!secretAuthenticated && !adminAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (adminAuthenticated && (!origin || origin !== new URL(request.url).origin)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  let options: { force?: boolean; notify?: boolean } = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    if (Number(request.headers.get("content-length") ?? 0) > 2048) return Response.json({ error: "Request too large" }, { status: 413 });
    try {
      const body = JSON.parse(await readBoundedText(new Response(request.body), 2048)) as Record<string, unknown>;
      if (!body || Array.isArray(body) || typeof body !== "object") return Response.json({ error: "Invalid options" }, { status: 400 });
      options = { force: body.force === true, notify: body.notify !== false };
    } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  }
  return executeRefresh(request, options);
}
