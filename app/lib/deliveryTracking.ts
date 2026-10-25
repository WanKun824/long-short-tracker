import { getD1, getRuntimeEnv } from "../../db";
import { readBoundedText } from "./sec13f";
import { recordSourceHealth } from "./sourceHealth";


export async function reconcileRecentDeliveryEvents(checkedAt: string) {
  const runtime = getRuntimeEnv();
  if (!runtime.RESEND_API_KEY) return;
  const db = getD1();
  const rows = await db.prepare(`SELECT DISTINCT d.provider_id FROM alert_deliveries d
    WHERE d.status = 'sent' AND d.provider_id IS NOT NULL AND datetime(d.created_at) >= datetime('now', '-7 days')
      AND NOT EXISTS (SELECT 1 FROM delivery_events e WHERE e.provider_id = d.provider_id
        AND e.type IN ('email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained', 'email.failed'))
    ORDER BY d.created_at DESC LIMIT 10`).all<{ provider_id: string }>();
  let previousRequestAt = 0;
  for (const row of rows.results) {
    try {
      const delay = 600 - (Date.now() - previousRequestAt);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      previousRequestAt = Date.now();
      const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.provider_id)}`, {
        headers: { authorization: `Bearer ${runtime.RESEND_API_KEY}` }, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Resend delivery status ${response.status}; full-access email key or webhook required`);
      const body = JSON.parse(await readBoundedText(response, 100_000)) as { last_event?: string };
      if (body.last_event && /^[a-z_]+$/.test(body.last_event)) {
        await db.prepare(`INSERT OR IGNORE INTO delivery_events (event_id, provider_id, type, occurred_at) VALUES (?, ?, ?, ?)`)
          .bind(`poll:${row.provider_id}:${body.last_event}`, row.provider_id, `email.${body.last_event}`, checkedAt).run();
      }
      await recordSourceHealth("resend:delivery-status", "Resend delivery tracking", "ok", checkedAt);
    } catch (cause) {
      await recordSourceHealth("resend:delivery-status", "Resend delivery tracking", "error", checkedAt, [], cause instanceof Error ? cause.message : "Delivery status unavailable");
      break;
    }
  }
}
