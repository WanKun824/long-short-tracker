# LONG / SHORT TRACKER

## [访问网站 → lst.vincenvan.cc](https://lst.vincenvan.cc/)

追踪 8 家投资机构的 SEC 13F 披露持仓、季度变动与公开动态，支持邮件订阅和运行历史查询。

[管理面板](https://lst.vincenvan.cc/admin) · [运维说明](docs/operations.md) · [定时任务配置](docs/cloud-scheduler.md) · [新闻与邮件规则](docs/news-digest-rules.md)

## 项目功能

- **机构持仓**：查看申报持仓、披露市值、组合权重和原始 SEC 文件。
- **季度变动**：比较新增、退出、增持和减持，支持追踪关联申报主体。
- **经理介绍**：提供基金经理背景、代表经历与投资风格简介。
- **邮件订阅**：订阅时发送当前状态，出现新申报或符合规则的公开动态时发送更新。
- **运行面板**：查看订阅人数、任务历史、信源健康、邮件提交及送达回执。
- **云端定时**：每天香港／台北时间 08:00 自动检查，电脑关机不影响运行。

## 关注机构

- Situational Awareness LP
- Berkshire Hathaway
- Scion Asset Management
- Duquesne Family Office
- Atreides Management
- TCI Fund Management
- The Baupost Group
- Pershing Square Capital Management

## 数据来源与范围

**持仓数据来自 SEC EDGAR 原始申报。** 系统读取机构 submissions 记录及 information-table XML，不使用第三方持仓数据库作为更新依据。遇到 13F-NT 关联申报通知时，会核对实际申报主体和持仓归属。无法核实股票代码的新证券暂以 CUSIP 显示。

**新闻与公开动态单独处理。** 当前直接读取 The New York Times、CNBC、Financial Times、The Economist 的 RSS，并通过 GDELT 补充发现可信媒体及官方来源；X 账号监测属于可选功能。来源必须通过白名单与机构关键词筛选，邮件保留原始链接。过期的 WSJ Markets RSS 已停用，WSJ 仍保留在媒体来源白名单中。

新闻源或摘要服务不可用时静默降级，不发送新闻抓取失败告警。SEC、数据库和实际邮件发送故障仍保留运维告警。

13F 是延迟披露数据，不代表实时交易，也不能完整反映空头、衍生品或其他未披露敞口。本项目仅供信息参考。

## 部署与定时任务

正式网站部署在 Cloudflare Workers，网站、管理面板与定时任务使用同一个 D1 数据库。

- 网站：**[https://lst.vincenvan.cc/](https://lst.vincenvan.cc/)**
- 管理面板：[https://lst.vincenvan.cc/admin](https://lst.vincenvan.cc/admin)
- Worker：`long-short-tracker`
- 数据库：`long-short-tracker-db`
- 定时计划：`0 0 * * *`，即每天香港／台北时间 08:00

刷新接口需要管理员会话或有效密钥。普通手动检查不会提前占用当天 08:00 的检查；数据库并发锁防止重复运行，中断任务会按超时处理。

完整部署、接口调用与故障排查步骤见[运维说明](docs/operations.md)。

## 本地运行

需要 Node.js 22.13 或更新版本，以及 npm。

```bash
npm ci
npx wrangler types
npm run dev
```

检查与构建：

```bash
npx tsc --noEmit --incremental false
npm test
npm audit --omit=dev
```

部署到 Cloudflare：

```bash
npx wrangler login
npm run deploy
```

## 环境变量

在 Cloudflare 的 **Workers & Pages → long-short-tracker → Settings → Variables and Secrets** 中配置。密钥使用加密 Secret 保存。

| 变量 | 用途 |
| --- | --- |
| `PUBLIC_SITE_URL` | 正式网站地址：`https://lst.vincenvan.cc` |
| `ADMIN_PASSWORD` | 管理面板登录密码 |
| `ADMIN_SESSION_SECRET` | 管理员会话签名密钥 |
| `RESEND_API_KEY` | 邮件发送密钥 |
| `ALERT_FROM_EMAIL` | 已验证的发件地址 |
| `OPERATIONS_ALERT_EMAIL` | 运维故障通知邮箱 |
| `REFRESH_SECRET` | 可选的外部刷新接口鉴权密钥 |
| `RESEND_WEBHOOK_SECRET` | 可选的邮件送达回执签名密钥 |
| `X_BEARER_TOKEN` | 可选的官方 X 账号监测凭证 |
| `DEEPSEEK_API_KEY` | 可选的新闻摘要凭证 |
| `DEEPSEEK_BASE_URL` | 摘要接口地址，默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 摘要模型，默认 `deepseek-v4-flash` |

例如，通过终端保存邮件密钥：

```bash
npx wrangler secret put RESEND_API_KEY
```

不要把生产密钥、管理员密码或订阅者数据提交到仓库。

## 邮件与送达回执

“已提交”表示 Resend 接受了发送请求，“确认送达”需要供应商回执。只允许发信的 API Key 不能查询送达状态；可配置签名 Webhook，或使用具备读取权限的密钥。

新闻摘要和订阅状态邮件在发送前写入持久队列，失败后会在后续正常刷新中重试，并排除已退订的收件人。回执配置方法见[运维说明的邮件部分](docs/operations.md#email-delivery-and-retries)。
