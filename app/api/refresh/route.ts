import { getRuntimeEnv } from "../../../db";
import { refreshHoldings } from "../../lib/refreshHoldings";
import { completeRefreshRun, failRefreshRun, startRefreshRun, type RefreshRunContext } from "../../lib/refreshRunHistory";

export async function POST(request: Request) {
  let run: RefreshRunContext | null = null;
  try {
    run = await startRefreshRun(request);
    const runtime = getRuntimeEnv();
    const suppliedSecret = request.headers.get("x-refresh-secret");
    const force = Boolean(runtime.REFRESH_SECRET && suppliedSecret === runtime.REFRESH_SECRET);
    const result = await refreshHoldings({ force });
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
  }
}
