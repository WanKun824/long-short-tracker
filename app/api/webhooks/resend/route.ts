import { ensureDbSchema, getD1, getRuntimeEnv } from "../../../../db";
import { verifyResendWebhook } from "../../../lib/resendWebhook";
import { readBoundedText } from "../../../lib/sec13f";

export async function POST(request: Request) {
  const secret = getRuntimeEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook not configured" }, { status: 503 });
  let body: string;
  try { body = await readBoundedText(new Response(request.body, { headers: request.headers }), 128_000); }
  catch { return Response.json({ error: "Invalid payload" }, { status: 413 }); }
  if (!await verifyResendWebhook(body, request.headers, secret)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try { event = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!event || !/^email\.[a-z_]+$/.test(event.type ?? "") || !event.data?.email_id || !event.created_at || !Number.isFinite(Date.parse(event.created_at))) {
    return Response.json({ error: "Invalid event" }, { status: 400 });
  }
  await ensureDbSchema();
  await getD1().prepare(`INSERT OR IGNORE INTO delivery_events (event_id, provider_id, type, occurred_at)
    SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM alert_deliveries WHERE provider_id = ?)`)
    .bind(request.headers.get("svix-id"), event.data.email_id, event.type, new Date(event.created_at).toISOString(), event.data.email_id).run();
  return Response.json({ received: true });
}
