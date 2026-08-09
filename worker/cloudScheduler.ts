const MAX_RESPONSE_BYTES = 1_000_000;
const REFRESH_TIMEOUT_MS = 14 * 60 * 1_000;

export type CloudSchedulerEnv = {
  SITES_REFRESH_URL: string;
  SITES_REFRESH_BEARER_TOKEN: string;
};

export type SchedulerAlertEnv = {
  RESEND_API_KEY: string;
  ALERT_FROM_EMAIL: string;
  OPERATIONS_ALERT_EMAIL: string;
};

type JsonRecord = Record<string, unknown>;

export type RefreshAudit = {
  skipped: boolean;
  checkedAt: string | null;
  fundChecks: number;
  updatedFunds: string[];
  publicSignalCount: number;
  emailsSent: number;
};

export class RefreshAuditError extends Error {
  readonly noRetry: boolean;

  constructor(message: string, noRetry = true) {
    super(message);
    this.name = "RefreshAuditError";
    this.noRetry = noRetry;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function readBoundedJson(response: Response, maxBytes = MAX_RESPONSE_BYTES) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RefreshAuditError("刷新接口响应超过安全上限", false);
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("response too large");
      throw new RefreshAuditError("刷新接口响应超过安全上限", false);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return text ? JSON.parse(text) as unknown : null;
  } catch {
    throw new RefreshAuditError("刷新接口返回了无效 JSON", false);
  }
}

function configuredRefreshUrl(value: string) {
  let url: URL;
  try {
    url = new URL("/api/refresh", value);
  } catch {
    throw new RefreshAuditError("SITES_REFRESH_URL 配置无效");
  }
  if (url.protocol !== "https:") {
    throw new RefreshAuditError("SITES_REFRESH_URL 必须使用 HTTPS");
  }
  return url;
}

function auditRefreshPayload(payload: unknown): RefreshAudit {
  const root = asRecord(payload);
  if (!root) throw new RefreshAuditError("刷新接口没有返回结果对象");
  if (asString(root.error)) throw new RefreshAuditError(`刷新接口失败：${asString(root.error)}`);

  if (root.skipped === true) {
    if (root.reason !== "already_checked_today" && root.reason !== "rate_limited") {
      throw new RefreshAuditError(`刷新被跳过：${asString(root.reason) || "原因未知"}`);
    }
    return {
      skipped: true,
      checkedAt: asString(root.checkedAt) || null,
      fundChecks: 0,
      updatedFunds: [],
      publicSignalCount: 0,
      emailsSent: 0,
    };
  }

  const results = Array.isArray(root.results) ? root.results.map(asRecord).filter((item): item is JsonRecord => Boolean(item)) : [];
  if (results.length !== 8) {
    throw new RefreshAuditError(`机构检查不完整：预期 8 家，实际 ${results.length} 家`);
  }

  const fundErrors = results.filter((item) => item.status === "error");
  const pendingAlertRetry = asRecord(root.pendingAlertRetry);
  const publicSignals = asRecord(root.publicSignals);
  const publicSignalDelivery = asRecord(root.publicSignalDelivery);
  const signalErrors = Array.isArray(publicSignals?.errors)
    ? publicSignals.errors.map(asRecord).filter((item): item is JsonRecord => Boolean(item))
    : [];
  const consecutiveSourceErrors = signalErrors.filter((item) => asFiniteNumber(item.errorStreak) >= 2);
  const deliveryFailures = results.reduce((sum, item) => sum + asFiniteNumber(item.failed), 0)
    + asFiniteNumber(pendingAlertRetry?.failed)
    + asFiniteNumber(publicSignalDelivery?.failed);
  const emailNotConfigured = [pendingAlertRetry, publicSignalDelivery, ...results]
    .some((item) => item?.emailStatus === "not_configured");
  const deepSeekFailed = publicSignalDelivery?.summaryStatus === "error";

  const failures: string[] = [];
  if (fundErrors.length) failures.push(`${fundErrors.length} 家机构刷新失败`);
  if (consecutiveSourceErrors.length) failures.push(`${consecutiveSourceErrors.length} 家机构出现连续信源错误`);
  if (deliveryFailures) failures.push(`${deliveryFailures} 封邮件投递失败`);
  if (emailNotConfigured) failures.push("邮件服务未配置");
  if (deepSeekFailed) failures.push("DeepSeek 新闻摘要失败（已回退为原始标题邮件）");
  if (failures.length) throw new RefreshAuditError(failures.join("；"));

  const updatedFunds = results
    .filter((item) => item.status === "updated")
    .map((item) => asString(item.fundId))
    .filter(Boolean);
  const emailsSent = results.reduce((sum, item) => sum + asFiniteNumber(item.sent), 0)
    + asFiniteNumber(pendingAlertRetry?.sent)
    + asFiniteNumber(publicSignalDelivery?.sent);

  return {
    skipped: false,
    checkedAt: asString(root.checkedAt) || null,
    fundChecks: results.length,
    updatedFunds,
    publicSignalCount: asFiniteNumber(publicSignals?.newCount),
    emailsSent,
  };
}

export async function runPrivateSiteRefresh(
  env: CloudSchedulerEnv,
  scheduledTime: number,
  fetcher: typeof fetch = fetch,
): Promise<RefreshAudit> {
  if (!env.SITES_REFRESH_BEARER_TOKEN?.trim()) {
    throw new RefreshAuditError("缺少 SITES_REFRESH_BEARER_TOKEN");
  }
  const url = configuredRefreshUrl(env.SITES_REFRESH_URL);
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "cache-control": "no-store",
      "OAI-Sites-Authorization": `Bearer ${env.SITES_REFRESH_BEARER_TOKEN}`,
      "user-agent": "LONG-SHORT-TRACKER-Cloud-Scheduler/1.0",
      "x-scheduled-time": new Date(scheduledTime).toISOString(),
    },
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  });
  const payload = await readBoundedJson(response);
  if (!response.ok) {
    const root = asRecord(payload);
    const detail = asString(root?.error) || `HTTP ${response.status}`;
    throw new RefreshAuditError(`私有站点刷新请求失败：${detail}`, response.status >= 400 && response.status < 500);
  }
  return auditRefreshPayload(payload);
}

export async function sendSchedulerFailureAlert(
  env: SchedulerAlertEnv,
  event: { cron: string; scheduledTime: number; error: string },
  fetcher: typeof fetch = fetch,
) {
  if (!env.RESEND_API_KEY?.trim() || !env.ALERT_FROM_EMAIL?.trim() || !env.OPERATIONS_ALERT_EMAIL?.trim()) {
    throw new Error("运维告警邮件未配置");
  }
  const scheduledAt = new Date(event.scheduledTime).toISOString();
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "Idempotency-Key": `cloud-refresh-failure/${event.scheduledTime}`,
    },
    body: JSON.stringify({
      from: env.ALERT_FROM_EMAIL,
      to: [env.OPERATIONS_ALERT_EMAIL],
      subject: "LONG / SHORT TRACKER · 云端刷新失败",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#161616">
        <h2>云端定时刷新失败</h2>
        <p><strong>计划：</strong>${escapeHtml(event.cron)}</p>
        <p><strong>计划时间：</strong>${escapeHtml(scheduledAt)}</p>
        <p><strong>错误：</strong>${escapeHtml(event.error)}</p>
        <p><a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages">打开 Cloudflare Workers 日志</a></p>
        <p style="color:#666">13F 是延迟披露数据，不代表实时交易。</p>
      </div>`,
    }),
  });
  const payload = await readBoundedJson(response, 100_000);
  if (!response.ok) {
    const root = asRecord(payload);
    throw new Error(asString(root?.message) || `Resend ${response.status}`);
  }
  return { sent: true, providerId: asString(asRecord(payload)?.id) || null };
}
