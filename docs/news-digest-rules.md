# 新闻获取与邮件摘要规则

本文说明 LONG / SHORT TRACKER 如何获取公开新闻、筛选资料、调用 DeepSeek，以及何时发送邮件。系统不把新闻或模型输出当作持仓证据。

## 当前运行方式

Cloudflare Cron 每天 00:00 UTC（香港时间 08:00）在 Worker 内部直接运行刷新处理器。正式站点、管理面板和定时任务共用 Cloudflare D1 `long-short-tracker-db`，电脑关机不会影响运行。

一次刷新分为两条相互独立的数据链：

1. **13F 持仓链：**只读取 SEC EDGAR 的 submissions feed 与原始 information-table XML。DeepSeek 不参与持仓获取、持仓比较或新增/退出/增减持判断。
2. **公开信息链：**抓取可信 RSS、GDELT 发现结果和可选的官方 X 帖文，经过规则筛选后写入 D1；若出现首次基线之后的新资料，再由 DeepSeek 生成有来源约束的中文摘要并通过 Resend 投递。

邮件是“每日检查、变化触发”，不是每天固定发送一封空邮件。没有新 13F、没有新的公开资料且系统正常时，不发常规邮件。

## 资料来源

### 直接 RSS

- The New York Times · Business
- The Wall Street Journal · Markets
- CNBC
- Financial Times
- The Economist

### GDELT 发现

GDELT 只承担检索和发现，不自动成为可信来源。结果必须通过最终网址的域名白名单：

- Reuters
- Bloomberg
- Financial Times
- The Wall Street Journal
- The New York Times
- CNBC
- Barron's
- The Economist
- Institutional Investor
- Pensions & Investments
- 已登记的基金或经理官方网站

### 官方 X

只有配置 `X_BEARER_TOKEN` 后才启用，并且只查询源注册表中确认过的账号。目前包括 Leopold Aschenbrenner、Gavin Baker 和 Bill Ackman。查询排除转发与回复；X 未配置不会影响 SEC 或财经媒体刷新。

## 筛选与去重规则

- 时间窗口：最近 7 天。
- GDELT：最多读取 250 条，按时间倒序。
- 相关性：标题必须包含该基金或经理配置的至少一个检索词。
- 数量：每家机构每轮最多保留 8 条。
- 域名：以最终来源网址为准，非白名单域名丢弃。
- 去重键：`SHA-256(fundId | sourceUrl)`。
- 持久化：通过筛选的资料写入 D1 `public_signals` 表。
- 首次成功运行：只建立基线，不发送历史新闻邮件。
- 后续运行：只对新去重键触发摘要邮件；邮件保留来源、发布日期、原始标题和原始链接。

各机构关键词、官网和账号配置见 `app/data/researchSources.ts`；抓取与筛选逻辑见 `app/lib/publicSignals.ts` 和 `app/lib/publicSignalParsers.ts`。

## DeepSeek 的职责和边界

模型配置：

- Base URL：`https://api.deepseek.com`
- Endpoint：`POST /chat/completions`
- Model：`deepseek-v4-flash`
- Thinking：关闭
- Output：JSON object
- Temperature：`0.1`

输入只包含已经通过规则筛选的 `signalId`、机构标识、资料类型、来源名称、原始标题、发布日期和原始链接。提示词要求模型：

- 只根据这些字段整理，不增加外部事实；
- 每个摘要条目必须引用输入中的 `signalId`；
- 不得把媒体报道写成 SEC 申报；
- 不得推断实时持仓、买卖、空头规模或投资意图；
- 明确 13F 是延迟披露数据。

程序会再次校验模型返回的 JSON，丢弃不存在的 `signalId`，限制文本和响应大小。DeepSeek 调用失败时，系统回退为原始标题邮件，同时把摘要失败列入 Cloudflare 运维告警；不会因此伪造或丢失原始来源。

实现见 `app/lib/deepseekDigest.ts`、`app/lib/marketSignalsEmail.ts` 和 `app/lib/refreshHoldings.ts`。

## 环境变量

敏感值只存为 Cloudflare/Sites 加密变量：

- `DEEPSEEK_API_KEY`：DeepSeek API 密钥
- `RESEND_API_KEY`：Resend 邮件密钥

非敏感值：

- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_MODEL=deepseek-v4-flash`
- `ALERT_FROM_EMAIL`、`PUBLIC_SITE_URL`

密钥不得写入 GitHub、`wrangler.jsonc`、`.env`、测试数据或日志。已经在聊天或其他明文位置出现过的密钥，应在部署验证后轮换。

## 相关接口

### `POST /api/refresh`

执行 SEC 与公开信息刷新。响应中的 `publicSignals` 给出抓取状态，`publicSignalDelivery` 给出邮件和 DeepSeek 摘要状态：

- `summaryStatus: deepseek`：使用 DeepSeek 摘要；
- `summaryStatus: not_needed`：本轮没有新资料；
- `summaryStatus: not_configured`：未配置密钥；
- `summaryStatus: error`：模型调用失败，已使用原始标题回退。

### `GET /api/status`

返回站点数据与邮件健康状态。`refreshSchedule` 为 `daily_08_hong_kong`，`refreshGuard` 为 `hong_kong_calendar_day`；`refreshIntervalHours` 保留为 `24`，用于旧版界面兼容。

## 官方接口文档

- DeepSeek Models：<https://api-docs.deepseek.com/api/list-models>
- DeepSeek Chat Completion：<https://api-docs.deepseek.com/api/create-chat-completion>
- DeepSeek JSON Output：<https://api-docs.deepseek.com/guides/json_mode/>
- SEC EDGAR：<https://www.sec.gov/edgar/search/>
- GDELT DOC API：<https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/>
