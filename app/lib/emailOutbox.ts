import { getD1, getRuntimeEnv } from "../../db";
import { DELIVERY_CLAIM_SQL, PENDING_OUTBOX_SQL } from "./alertDelivery";
import { readBoundedText } from "./sec13f";

type EmailPayload = { subject: string; html: string };
type Recipient = { id: number; email: string };

export async function deliverQueuedEmail(recipient: Recipient, fundId: string, accession: string, email: EmailPayload) {
  const db = getD1();
  const runtime = getRuntimeEnv();
  await db.prepare(`INSERT OR IGNORE INTO email_outbox (subscriber_id, fund_id, accession, subject, html)
    VALUES (?, ?, ?, ?, ?)`).bind(recipient.id, fundId, accession, email.subject, email.html).run();
  const claim = await db.prepare(DELIVERY_CLAIM_SQL).bind(recipient.id, fundId, accession).run();
  if (Number(claim.meta.changes ?? 0) === 0) return "already_sent" as const;
  let status: "sent" | "failed" = "failed";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: `Bearer ${runtime.RESEND_API_KEY}`,
        "content-type": "application/json",
        "Idempotency-Key": `lst/${recipient.id}/${fundId}/${accession}`,
      },
      body: JSON.stringify({ from: runtime.ALERT_FROM_EMAIL, to: [recipient.email], subject: email.subject, html: email.html }),
    });
    const text = await readBoundedText(response, 100_000);
    const body = text ? JSON.parse(text) as { id?: string; message?: string } : {};
    if (!response.ok || !body.id) throw new Error(body.message ?? `Resend ${response.status}`);
    status = "sent";
    providerId = body.id;
  } catch (cause) {
    error = cause instanceof Error ? cause.message.slice(0, 500) : "Email delivery failed";
  }
  await db.prepare(`UPDATE alert_deliveries SET provider_id = ?, status = ?, error = ?, created_at = CURRENT_TIMESTAMP
    WHERE subscriber_id = ? AND fund_id = ? AND accession = ?`)
    .bind(providerId, status, error, recipient.id, fundId, accession).run();
  return status;
}

export async function retryQueuedEmails() {
  const runtime = getRuntimeEnv();
  if (!runtime.RESEND_API_KEY || !runtime.ALERT_FROM_EMAIL) return { sent: 0, failed: 0 };
  const pending = await getD1().prepare(PENDING_OUTBOX_SQL).all<{
      subscriber_id: number; email: string; fund_id: string; accession: string; subject: string; html: string;
    }>();
  let sent = 0;
  let failed = 0;
  for (const item of pending.results) {
    const status = await deliverQueuedEmail({ id: item.subscriber_id, email: item.email }, item.fund_id, item.accession, item);
    if (status === "sent") sent += 1;
    if (status === "failed") failed += 1;
  }
  return { sent, failed };
}
