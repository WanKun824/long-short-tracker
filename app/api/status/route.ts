import { ensureDbSchema, getD1, getRuntimeEnv } from "../../../db";
import { funds } from "../../data/funds";

type CountRow = { count: number };
type RefreshRow = { value: string; updated_at: string };

export async function GET() {
  const runtime = getRuntimeEnv();
  const emailReady = Boolean(runtime.RESEND_API_KEY && runtime.ALERT_FROM_EMAIL && runtime.PUBLIC_SITE_URL);

  try {
    await ensureDbSchema();
    const db = getD1();
    const [snapshotRow, refreshRow] = await Promise.all([
      db.prepare("SELECT COUNT(DISTINCT fund_id) AS count FROM fund_snapshots").first<CountRow>(),
      db.prepare("SELECT value, updated_at FROM system_state WHERE key = 'last_refresh'").first<RefreshRow>(),
    ]);
    const snapshotFunds = Number(snapshotRow?.count ?? 0);

    return Response.json({
      dataReady: snapshotFunds > 0,
      emailReady,
      trackedFunds: funds.length,
      snapshotFunds,
      lastRefreshAt: refreshRow?.value ?? refreshRow?.updated_at ?? null,
      refreshIntervalHours: 6,
    });
  } catch {
    return Response.json({
      dataReady: false,
      emailReady,
      trackedFunds: funds.length,
      snapshotFunds: 0,
      lastRefreshAt: null,
      refreshIntervalHours: 6,
    });
  }
}
