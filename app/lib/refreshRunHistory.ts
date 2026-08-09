import { ensureDbSchema, getD1 } from "../../db";

type JsonRecord = Record<string, unknown>;

export type RefreshRunContext = {
  id: string;
  startedAt: string;
  trigger: "scheduled" | "manual";
  scheduledAt: string | null;
};

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function validIso(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export async function startRefreshRun(request: Request): Promise<RefreshRunContext> {
  await ensureDbSchema();
  const scheduledAt = validIso(request.headers.get("x-scheduled-time"));
  const context: RefreshRunContext = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    trigger: scheduledAt ? "scheduled" : "manual",
    scheduledAt,
  };
  await getD1().prepare(`INSERT INTO refresh_runs
    (id, trigger, scheduled_at, started_at, status)
    VALUES (?, ?, ?, ?, 'running')`)
    .bind(context.id, context.trigger, context.scheduledAt, context.startedAt)
    .run();
  return context;
}

export async function completeRefreshRun(context: RefreshRunContext, payload: unknown) {
  const root = asRecord(payload) ?? {};
  const results = Array.isArray(root.results)
    ? root.results.map(asRecord).filter((item): item is JsonRecord => Boolean(item))
    : [];
  const pendingRetry = asRecord(root.pendingAlertRetry);
  const signalDelivery = asRecord(root.publicSignalDelivery);
  const publicSignals = asRecord(root.publicSignals);
  const signalErrors = Array.isArray(publicSignals?.errors)
    ? publicSignals.errors.map(asRecord).filter((item): item is JsonRecord => Boolean(item))
    : [];

  const emailsSent = results.reduce((sum, item) => sum + number(item.sent), 0)
    + number(pendingRetry?.sent)
    + number(signalDelivery?.sent);
  const emailsFailed = results.reduce((sum, item) => sum + number(item.failed), 0)
    + number(pendingRetry?.failed)
    + number(signalDelivery?.failed);
  const fundErrors = results.filter((item) => item.status === "error");
  const consecutiveSignalErrors = signalErrors.filter((item) => number(item.errorStreak) >= 2);
  const emailNotConfigured = [pendingRetry, signalDelivery, ...results]
    .some((item) => item?.emailStatus === "not_configured");
  const summaryFailed = signalDelivery?.summaryStatus === "error";
  const reasons = [
    fundErrors.length ? `${fundErrors.length} 家机构刷新失败` : "",
    consecutiveSignalErrors.length ? `${consecutiveSignalErrors.length} 家机构出现连续信源错误` : "",
    emailsFailed ? `${emailsFailed} 封邮件投递失败` : "",
    emailNotConfigured ? "邮件服务未配置" : "",
    summaryFailed ? "DeepSeek 新闻摘要失败" : "",
  ].filter(Boolean);

  const skipped = root.skipped === true;
  const status = skipped ? "skipped" : reasons.length ? "failed" : "succeeded";
  const reason = skipped
    ? root.reason === "rate_limited" ? "24小时内已经完整刷新，防止重复运行" : String(root.reason ?? "刷新被跳过")
    : reasons.join("；") || null;
  const completedAt = new Date().toISOString();

  await getD1().prepare(`UPDATE refresh_runs SET
    completed_at = ?, status = ?, reason = ?, duration_ms = ?, fund_checks = ?,
    updated_funds = ?, public_signal_count = ?, emails_sent = ?, emails_failed = ?, error = ?
    WHERE id = ?`)
    .bind(
      completedAt,
      status,
      reason,
      Math.max(0, Date.parse(completedAt) - Date.parse(context.startedAt)),
      results.length,
      results.filter((item) => item.status === "updated").length,
      number(publicSignals?.newCount),
      emailsSent,
      emailsFailed,
      status === "failed" ? reason : null,
      context.id,
    )
    .run();
}

export async function failRefreshRun(context: RefreshRunContext, cause: unknown) {
  const completedAt = new Date().toISOString();
  const error = cause instanceof Error ? cause.message.slice(0, 1000) : "刷新服务发生未知错误";
  await getD1().prepare(`UPDATE refresh_runs SET
    completed_at = ?, status = 'failed', duration_ms = ?, error = ?
    WHERE id = ?`)
    .bind(
      completedAt,
      Math.max(0, Date.parse(completedAt) - Date.parse(context.startedAt)),
      error,
      context.id,
    )
    .run();
}
