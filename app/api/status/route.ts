import { ensureDbSchema, getD1, getRuntimeEnv } from "../../../db";
import { funds } from "../../data/funds";

type CountRow = { count: number };
type RefreshRow = { value: string; updated_at: string };
type SignalRow = { count: number; latest: string | null };

export async function GET() {
  const runtime = getRuntimeEnv();
  const emailReady = Boolean(runtime.RESEND_API_KEY && runtime.ALERT_FROM_EMAIL && runtime.PUBLIC_SITE_URL);

  try {
    await ensureDbSchema();
    const db = getD1();
    const [snapshotRow, refreshRow, signalRow] = await Promise.all([
      db.prepare("SELECT COUNT(DISTINCT fund_id) AS count FROM fund_snapshots").first<CountRow>(),
      db.prepare("SELECT value, updated_at FROM system_state WHERE key = 'last_refresh'").first<RefreshRow>(),
      db.prepare("SELECT COUNT(*) AS count, MAX(discovered_at) AS latest FROM public_signals").first<SignalRow>(),
    ]);
    const snapshotFunds = Number(snapshotRow?.count ?? 0);

    return Response.json({
      dataReady: snapshotFunds > 0,
      emailReady,
      trackedFunds: funds.length,
      snapshotFunds,
      lastRefreshAt: refreshRow?.value ?? refreshRow?.updated_at ?? null,
      refreshIntervalHours: 6,
      publicSignalsReady: true,
      publicSignalCount: Number(signalRow?.count ?? 0),
      lastPublicSignalsAt: signalRow?.latest ?? null,
      officialXReady: Boolean(runtime.X_BEARER_TOKEN),
    });
  } catch {
    return Response.json({
      dataReady: false,
      emailReady,
      trackedFunds: funds.length,
      snapshotFunds: 0,
      lastRefreshAt: null,
      refreshIntervalHours: 6,
      publicSignalsReady: false,
      publicSignalCount: 0,
      lastPublicSignalsAt: null,
      officialXReady: Boolean(runtime.X_BEARER_TOKEN),
    });
  }
}
