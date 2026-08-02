import { getRuntimeEnv } from "../../../db";
import { refreshHoldings } from "../../lib/refreshHoldings";

export async function POST(request: Request) {
  try {
    const runtime = getRuntimeEnv();
    const suppliedSecret = request.headers.get("x-refresh-secret");
    const force = Boolean(runtime.REFRESH_SECRET && suppliedSecret === runtime.REFRESH_SECRET);
    const result = await refreshHoldings({ force });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "刷新服务暂不可用";
    return Response.json({ error: message }, { status: 500 });
  }
}
