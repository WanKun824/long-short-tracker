# LONG / SHORT TRACKER

An editorial 13F research dashboard for following the disclosed U.S. equity portfolios of selected institutional investors.

[Live site](https://vincenvan.cc/)

## Coverage

The tracker currently covers eight managers:

- Situational Awareness LP
- Berkshire Hathaway
- Scion Asset Management
- Duquesne Family Office
- Atreides Management
- TCI Fund Management
- The Baupost Group
- Pershing Square Capital Management

## Features

- Complete disclosed 13F holdings with portfolio weights and market values
- Manager profiles and concise investment-style notes
- Position-change tracking across filing periods
- Email subscriptions for filing updates and source-linked public-context summaries organized by DeepSeek
- Curated monitoring of official websites, confirmed official X accounts, and established financial press
- Protected operations dashboard for subscriber totals, refresh history, source history, and delivery status
- Scheduled refresh workflow backed by a persistent database

## Data and methodology

Holdings are read directly from the SEC EDGAR submissions feed and each filing's original information-table XML. The refresh process does not use a third-party holdings database. Because SEC information tables do not include ticker symbols, a new security that cannot be matched to an earlier verified snapshot is shown by CUSIP until its ticker is verified.

The source hierarchy is deliberately separated:

1. **Holdings:** SEC EDGAR is the sole source of truth for 13F positions and filing dates.
2. **Official context:** manager websites, regulatory profiles, and confirmed official X accounts.
3. **Media context:** Reuters, Bloomberg, Financial Times, The Wall Street Journal, The New York Times, CNBC, Barron's, The Economist, Institutional Investor, and Pensions & Investments. The monitor reads available publisher feeds directly and supplements them with GDELT discovery; every result is filtered by its final source domain.

Public-context items are stored and emailed separately from 13F position changes. DeepSeek only organizes items that already passed the source rules; every item includes its source, publication date, original title, and original link. News, social posts, and model output are never treated as evidence of a live position or trade.

Values reflect the reporting period and may differ from a manager's current positions. Short positions, most derivatives, non-U.S. securities, and other undisclosed exposures are generally outside the scope of Form 13F.

This project is intended for research and information only. It is not investment advice.

## Local development

Requirements:

- Node.js 22.13 or later
- npm

```bash
npm install
npm run dev
```

Validation:

```bash
npm test
```

## Runtime configuration

The application supports these server-side environment variables:

- `PUBLIC_SITE_URL`: canonical deployed URL
- `ADMIN_EMAIL`: comma-separated administrator allowlist
- `RESEND_API_KEY`: transactional email provider credential
- `ALERT_FROM_EMAIL`: verified sender address
- `REFRESH_SECRET`: optional authorization secret for scheduled refresh requests
- `X_BEARER_TOKEN`: optional X API bearer token for recent posts from confirmed official accounts
- `DEEPSEEK_API_KEY`: encrypted credential used to organize source-linked public-context emails
- `DEEPSEEK_BASE_URL`: defaults to `https://api.deepseek.com`
- `DEEPSEEK_MODEL`: defaults to `deepseek-v4-flash`

Never commit production credentials or subscriber data to the repository.

## Cloud scheduler

Production refreshes run in Cloudflare Workers at 00:00 UTC (08:00 in Hong Kong). The scheduler securely calls the private Sites deployment, so it continues running when a personal computer is offline.

Deployment steps, API contracts, secret rotation, logs, and incident handling are documented in [docs/cloud-scheduler.md](docs/cloud-scheduler.md).

News sources, filtering rules, DeepSeek prompt boundaries, fallback behavior, and API status fields are documented in [docs/news-digest-rules.md](docs/news-digest-rules.md).

## Cloudflare Workers email setup

Cloudflare Workers and the private Sites deployment keep separate runtime settings. The Worker reads its non-sensitive email settings from `wrangler.jsonc`:

- `PUBLIC_SITE_URL`: public Worker URL used in email links
- `ALERT_FROM_EMAIL`: `LONG / SHORT TRACKER <alerts@vincenvan.cc>`

Store the Resend credential as an encrypted Cloudflare secret:

```bash
npx wrangler secret put RESEND_API_KEY
```

The equivalent dashboard path is **Workers & Pages → long-short-tracker → Settings → Variables and Secrets**. Add `RESEND_API_KEY` as an encrypted secret, then deploy the Worker:

```bash
npm run deploy
```

The Resend API key must have sending-only access and should be limited to the verified `vincenvan.cc` domain. Never add the key to `wrangler.jsonc`, committed environment files, GitHub Actions logs, or repository documentation.

## Optional official X monitoring

Trusted financial-press monitoring works without an X credential. To include posts from the confirmed official accounts in the source registry, create a bearer token in the X Developer Console and store it as an encrypted secret:

```bash
npx wrangler secret put X_BEARER_TOKEN
```

For the private Sites deployment, add `X_BEARER_TOKEN` separately in that site's environment-variable settings. A missing token is reported as `not_configured` and does not cause the SEC or news refresh to fail. Never put the token in source control.
