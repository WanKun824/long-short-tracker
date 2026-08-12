# 云端定时刷新运维手册

LONG / SHORT TRACKER 的定时任务运行在 Cloudflare Workers Cron Triggers，不依赖个人电脑。电脑关机、Codex 未打开或浏览器未登录，都不会影响计划执行。

## 当前架构

```text
Cloudflare Cron（每天 00:00 UTC）
  → Worker 内部直接调用刷新处理器（不经过公网 HTTP）
  → SEC EDGAR 原始 13F + 官方/主流媒体公开信源
  → Cloudflare D1 long-short-tracker-db 写入快照与历史
  → 有新 13F 或重大公开动态时由 Resend 发邮件
  → Cloudflare Cron Events / Workers Logs 记录结果
```

香港时间为 UTC+8，因此 `0 0 * * *` 对应每天 08:00。Cloudflare Cron 使用 UTC，修改触发器后最多可能需要约 15 分钟传播。

13F 是延迟披露数据，不代表实时交易。公开动态邮件必须保留原始来源名称、日期和链接，并与 SEC 持仓披露明确区分。

## 已部署的配置

配置文件：`wrangler.jsonc`

```jsonc
{
  "triggers": { "crons": ["0 0 * * *"] },
  "secrets": {
    "required": ["RESEND_API_KEY", "OPERATIONS_ALERT_EMAIL", "DEEPSEEK_API_KEY"]
  }
}
```

`OPERATIONS_ALERT_EMAIL` 是只接收故障告警的管理员邮箱，同样作为 encrypted secret 保存。正常刷新不发送运维邮件；刷新失败、8 家机构检查不完整、连续信源错误或邮件投递失败时才发送。告警使用计划时间作为 Resend idempotency key，避免同一次任务重复发信。

## 第一次部署

要求：Node.js 22.13+、Cloudflare 账号、已登录 Wrangler、私有 Sites 项目和可用的 Resend 发信域名。

```powershell
npm ci
npx wrangler login
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put OPERATIONS_ALERT_EMAIL
npm test
npx tsc --noEmit
npx wrangler deploy
```

Cloudflare 控制台路径：**Workers & Pages → long-short-tracker → Settings → Triggers → Cron Triggers**。应看到 `0 0 * * *`。

## 接口

### `POST /api/refresh`

用途：执行完整刷新。外部手动调用可使用正式域名；云端定时器在 Worker 内部直接运行相同处理器，与网站和管理面板共用同一个 D1 数据库。

```http
POST https://lst.vincenvan.cc/api/refresh
Accept: application/json
Cache-Control: no-store
```

成功响应的重点字段：

- `results`：8 家机构的 SEC 检查结果；`updated` 表示发现新申报，`unchanged` 表示无新申报。
- `publicSignals`：公开信源检查、新动态数量和连续错误计数。
- `pendingAlertRetry`：历史失败邮件的重试结果。
- `publicSignalDelivery`：公开动态摘要的发送、失败数量和邮件配置状态。
- `skipped: true, reason: "already_checked_today"`：香港自然日内已经完成过刷新，属于正常防重；前一晚的刷新不会阻止次日 08:00 检查。

返回 HTTP 500、机构数量不是 8、任一机构 `status=error`、连续信源错误或邮件投递失败，都会让 Cron Event 记为失败。

### `GET /api/status`

用途：读取数据、邮件和公开信源的健康状态。重要字段包括 `dataReady`、`emailReady`、`trackedFunds`、`snapshotFunds`、`lastRefreshAt` 和 `refreshIntervalHours`。

### `GET /api/holdings`

用途：读取当前公开展示的机构持仓快照。数据仍受 13F 延迟披露限制。

### `GET /api/admin/summary`

用途：管理面板读取订阅人数、历史快照和邮件投递统计。需要站点所有者身份，不应公开给外部调度器。

## 手动测试

生产环境可以直接测试同一个业务接口：

```powershell
$headers = @{ "Accept" = "application/json" }
Invoke-RestMethod -Method Post -Uri "https://lst.vincenvan.cc/api/refresh" -Headers $headers
```

本地测试 scheduled handler：

```powershell
npx wrangler dev --test-scheduled
Invoke-RestMethod "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+0+*+*+*&format=json"
```

公开 Worker 会把 `/__scheduled` 返回为 404，避免暴露旧式测试入口。

## 日志与故障处理

查看实时日志：

```powershell
npx wrangler tail long-short-tracker
```

也可以在 Cloudflare 控制台打开 **long-short-tracker → Logs → Cron Events**。成功日志事件为 `cloud_refresh_succeeded`，失败事件为 `cloud_refresh_failed`。故障邮件发送成功记录为 `cloud_refresh_failure_alert_sent`；若告警邮件本身也失败，则记录 `cloud_refresh_failure_alert_failed`，此时以 Cloudflare 日志为准。

排查顺序：

1. 定时器立即失败且日志出现 522/无效 JSON：检查是否误改为通过自定义域名请求 Worker 自身；正式调度必须使用内部处理器。
2. HTTP 500：查看 `long-short-tracker` Worker Logs，重点检查 D1、SEC、Resend 环境变量。
3. 机构检查不足 8 家：检查 SEC EDGAR 返回与对应 CIK。
4. 连续信源错误：检查官方 RSS、X API（若配置）和主流媒体信源；单个备用源暂时失败不等同于整套信源失败。
5. 邮件失败：在管理面板和 `alert_deliveries` 统计中查看错误，核对 Resend 域名、API key 和发件地址。

## 修改执行时间

编辑 `wrangler.jsonc` 的 `triggers.crons` 后重新部署。示例：

- 每天香港时间 08:00：`0 0 * * *`
- 每天香港时间 08:00、20:00：`0 */12 * * *`
- 每天香港时间 09:00：`0 1 * * *`

不要同时启用 Cloudflare Cron、GitHub Actions 和本地/Codex 定时任务，否则可能重复调用。业务接口按香港自然日防重，但仍应只保留一个正式调度器。

## 密钥轮换

轮换 Resend 或 DeepSeek 密钥后，分别运行 `npx wrangler secret put RESEND_API_KEY` 或 `npx wrangler secret put DEEPSEEK_API_KEY`，再检查 `/api/status` 与下一次 Cron Event。

任何命令输出、截图、工单和 GitHub 文档都不得包含 API key。
