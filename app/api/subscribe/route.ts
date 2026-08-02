import { ensureDbSchema, getD1, getRuntimeEnv } from "../../../db";
import { funds } from "../../data/funds";

const validFundIds = new Set<string>(funds.map((fund) => fund.id));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { email?: string; fundIds?: string[] };
    const email = payload.email?.trim().toLowerCase() ?? "";
    const fundIds = Array.from(new Set(payload.fundIds ?? [])).filter((id) => validFundIds.has(id));

    if (!emailPattern.test(email) || email.length > 254) {
      return Response.json({ error: "请输入有效的邮箱地址。" }, { status: 400 });
    }
    if (!fundIds.length) {
      return Response.json({ error: "请至少选择一家关注机构。" }, { status: 400 });
    }

    await ensureDbSchema();
    const db = getD1();
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");

    await db
      .prepare(`INSERT INTO subscribers (email, fund_ids, status, unsubscribe_token)
        VALUES (?, ?, 'active', ?)
        ON CONFLICT(email) DO UPDATE SET
          fund_ids = excluded.fund_ids,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP`)
      .bind(email, JSON.stringify(fundIds), token)
      .run();

    const runtime = getRuntimeEnv();
    const emailReady = Boolean(runtime.RESEND_API_KEY && runtime.ALERT_FROM_EMAIL && runtime.PUBLIC_SITE_URL);
    return Response.json({
      message: emailReady
        ? "订阅已保存。新申报出现时，我们会按你选择的机构发送中文摘要。"
        : "订阅偏好已保存。邮件投递通道尚在配置，启用后会按你的选择发送中文摘要。",
      emailReady,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "订阅服务暂不可用，请稍后重试。";
    return Response.json({ error: message }, { status: 500 });
  }
}
