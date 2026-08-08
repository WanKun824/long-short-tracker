import { ensureDbSchema, getD1, getRuntimeEnv } from "../../../db";
import { funds, holdings as baselineHoldings, type FundProfile, type Holding } from "../../data/funds";
import { DELIVERY_CLAIM_SQL } from "../../lib/alertDelivery";
import { latestPublicSignals } from "../../lib/publicSignals";
import { buildSubscriptionStatusEmail, type SubscriptionFundStatus } from "../../lib/subscriptionStatusEmail";

const validFundIds = new Set<string>(funds.map((fund) => fund.id));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const subscriptionDeliveryFundId = "__subscription__";
const subscriptionDeliveryAccession = "current-status-v1";

type SubscriberRow = { id: number; unsubscribe_token: string };
type SnapshotRow = {
  fund_id: string;
  period: string;
  filed_at: string;
  checked_at: string;
  data_json: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHolding(value: unknown): value is Holding {
  if (!isRecord(value)) return false;
  return typeof value.ticker === "string"
    && typeof value.issuer === "string"
    && typeof value.class === "string"
    && typeof value.cusip === "string"
    && typeof value.valueK === "number"
    && typeof value.weight === "number"
    && (value.shares === null || typeof value.shares === "number")
    && (value.principal === null || typeof value.principal === "number")
    && (value.option === null || value.option === "PUT" || value.option === "CALL");
}

function parseHoldings(value: string, fallback: Holding[]) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(isHolding) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function currentFundStatuses(db: D1Database, selectedFundIds: FundProfile["id"][]) {
  const result = await db.prepare(`SELECT fund_id, period, filed_at, checked_at, data_json
    FROM fund_snapshots
    WHERE id IN (SELECT MAX(id) FROM fund_snapshots GROUP BY fund_id)`).all<SnapshotRow>();
  const snapshots = new Map(result.results.map((row) => [row.fund_id, row]));
  const selected = new Set(selectedFundIds);
  const signals = await latestPublicSignals(selectedFundIds, 2);

  return funds.filter((fund) => selected.has(fund.id)).map<SubscriptionFundStatus>((fund) => {
    const snapshot = snapshots.get(fund.id);
    return {
      fundId: fund.id,
      fundName: fund.nameZh,
      period: snapshot?.period ?? fund.period,
      filedAt: snapshot?.filed_at ?? fund.filingDate,
      checkedAt: snapshot?.checked_at ?? null,
      status: fund.status,
      statusNote: fund.statusNote,
      holdings: snapshot ? parseHoldings(snapshot.data_json, baselineHoldings[fund.id]) : baselineHoldings[fund.id],
      signals: signals.get(fund.id) ?? [],
    };
  });
}

async function completeSubscriptionDelivery(
  db: D1Database,
  subscriberId: number,
  status: "sent" | "failed",
  providerId: string | null,
  error: string | null,
) {
  await db.prepare(`UPDATE alert_deliveries
    SET provider_id = ?, status = ?, error = ?, created_at = CURRENT_TIMESTAMP
    WHERE subscriber_id = ? AND fund_id = ? AND accession = ?`)
    .bind(providerId, status, error, subscriberId, subscriptionDeliveryFundId, subscriptionDeliveryAccession)
    .run();
}

async function sendCurrentStatusEmail({
  db,
  subscriber,
  recipient,
  selectedFundIds,
  apiKey,
  fromEmail,
  publicSiteUrl,
}: {
  db: D1Database;
  subscriber: SubscriberRow;
  recipient: string;
  selectedFundIds: FundProfile["id"][];
  apiKey: string;
  fromEmail: string;
  publicSiteUrl: string;
}) {
  const claim = await db.prepare(DELIVERY_CLAIM_SQL)
    .bind(subscriber.id, subscriptionDeliveryFundId, subscriptionDeliveryAccession)
    .run();
  if (Number(claim.meta.changes ?? 0) === 0) return "already_sent" as const;

  try {
    const currentFunds = await currentFundStatuses(db, selectedFundIds);
    const email = buildSubscriptionStatusEmail({
      funds: currentFunds,
      publicSiteUrl,
      unsubscribeToken: subscriber.unsubscribe_token,
    });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: email.subject,
        html: email.html,
      }),
    });
    const responseBody: unknown = await response.json().catch(() => ({}));
    const providerId = isRecord(responseBody) && typeof responseBody.id === "string" ? responseBody.id : null;
    const providerMessage = isRecord(responseBody) && typeof responseBody.message === "string"
      ? responseBody.message
      : null;
    if (!response.ok) throw new Error(providerMessage ?? `邮件服务 ${response.status}`);
    await completeSubscriptionDelivery(db, subscriber.id, "sent", providerId, null);
    return "sent" as const;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 500) : "当前状态邮件发送失败";
    await completeSubscriptionDelivery(db, subscriber.id, "failed", null, message);
    console.error(JSON.stringify({ message: "subscription status email failed", error: message }));
    return "failed" as const;
  }
}

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const email = isRecord(payload) && typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";
    const requestedFundIds = isRecord(payload) && Array.isArray(payload.fundIds)
      ? payload.fundIds.filter((id): id is string => typeof id === "string")
      : [];
    const fundIds = Array.from(new Set(requestedFundIds))
      .filter((id): id is FundProfile["id"] => validFundIds.has(id));

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

    const subscriber = await db.prepare("SELECT id, unsubscribe_token FROM subscribers WHERE email = ?")
      .bind(email)
      .first<SubscriberRow>();
    if (!subscriber) throw new Error("订阅记录未能保存，请稍后重试。");

    const runtime = getRuntimeEnv();
    const apiKey = runtime.RESEND_API_KEY;
    const fromEmail = runtime.ALERT_FROM_EMAIL;
    const publicSiteUrl = runtime.PUBLIC_SITE_URL;
    const emailReady = Boolean(apiKey && fromEmail && publicSiteUrl);
    const emailDelivery = apiKey && fromEmail && publicSiteUrl
      ? await sendCurrentStatusEmail({
          db,
          subscriber,
          recipient: email,
          selectedFundIds: fundIds,
          apiKey,
          fromEmail,
          publicSiteUrl,
        })
      : "not_configured" as const;

    return Response.json({
      message: emailDelivery === "sent"
        ? "订阅成功，当前13F状态邮件已发送，请查收。"
        : emailDelivery === "already_sent"
          ? "订阅偏好已更新。当前状态邮件此前已经发送。"
          : emailDelivery === "failed"
            ? "订阅已保存，但当前状态邮件发送失败；再次提交可重试。"
            : "订阅偏好已保存。邮件投递通道尚在配置。",
      emailReady,
      emailDelivery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "订阅服务暂不可用，请稍后重试。";
    return Response.json({ error: message }, { status: 500 });
  }
}
