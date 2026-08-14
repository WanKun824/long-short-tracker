import { ensureDbSchema, getD1 } from "../../../db";
import type { FundProfile, Holding } from "../../data/funds";

type SnapshotRow = {
  fund_id: string;
  data_json: string;
  period: string;
  accession: string;
  filed_at: string;
  checked_at: string;
};

export async function GET() {
  try {
    await ensureDbSchema();
    const result = await getD1().prepare(`SELECT fund_id, data_json, period, accession, filed_at, checked_at
      FROM fund_snapshots
      WHERE id IN (SELECT MAX(id) FROM fund_snapshots GROUP BY fund_id)`).all<SnapshotRow>();

    const holdings: Partial<Record<FundProfile["id"], Holding[]>> = {};
    const snapshots: Record<string, { period: string; accession: string; filedAt: string; checkedAt: string }> = {};
    for (const row of result.results) {
      const fundId = row.fund_id as FundProfile["id"];
      holdings[fundId] = JSON.parse(row.data_json) as Holding[];
      snapshots[row.fund_id] = {
        period: row.period,
        accession: row.accession,
        filedAt: row.filed_at,
        checkedAt: row.checked_at,
      };
    }

    return Response.json({ holdings, snapshots }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(
      { holdings: {}, snapshots: {} },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
