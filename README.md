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
- Email subscriptions for material filing updates
- Protected operations dashboard for subscriber totals, refresh history, and delivery status
- Scheduled refresh workflow backed by a persistent database

## Data and methodology

Portfolio data is derived from publicly available SEC 13F filings. Values reflect the reporting period and may differ from a manager's current positions. Short positions, most derivatives, non-U.S. securities, and other undisclosed exposures are generally outside the scope of Form 13F.

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

Never commit production credentials or subscriber data to the repository.

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

The Resend API key must have sending-only access and should be limited to the verified `vincenvan.cc` domain. Never add the key to `wrangler.jsonc`, `.env` files committed to Git, GitHub Actions logs, or repository documentation.
