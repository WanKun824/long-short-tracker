import { ensureDbSchema, getD1 } from "../../../db";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (token.length < 32) {
    return new Response("退订链接无效。", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  await ensureDbSchema();
  const result = await getD1()
    .prepare("UPDATE subscribers SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP WHERE unsubscribe_token = ?")
    .bind(token)
    .run();

  const message = result.meta.changes ? "你已成功退订持仓提醒。" : "退订链接无效或已经失效。";
  return new Response(message, { status: result.meta.changes ? 200 : 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}
