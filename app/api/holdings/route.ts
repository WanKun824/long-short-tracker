import { ensureDbSchema, getD1 } from "../../../db";
import type { FundProfile, Holding } from "../../data/funds";

type SnapshotRow = {
  fund_id: string;
  data_json: string;
  period: string;
  accession: string;
  filed_at: string;
  checked_at: string;
  reporting_cik: string | null;
  source_url: string | null;
};

export async function GET() {
  try {
    await ensureDbSchema();
    const result = await getD1().prepare(`SELECT s.fund_id, s.data_json, s.period, s.accession, s.filed_at, s.checked_at,
      json_extract(m.value, '$.reportingCik') AS reporting_cik, json_extract(m.value, '$.sourceUrl') AS source_url
      FROM fund_snapshots s LEFT JOIN system_state m ON m.key = 'sec_filing_meta:' || s.fund_id
        AND json_extract(m.value, '$.accession') = s.accession
      WHERE s.id IN (SELECT MAX(id) FROM fund_snapshots GROUP BY fund_id)`).all<SnapshotRow>();

    const holdings: Partial<Record<FundProfile["id"], Holding[]>> = {};
    const snapshots: Record<string, { period: string; accession: string; filedAt: string; checkedAt: string; reportingCik: string | null; sourceUrl: string | null }> = {};
    for (const row of result.results) {
      const fundId = row.fund_id as FundProfile["id"];
      holdings[fundId] = JSON.parse(row.data_json) as Holding[];
      snapshots[row.fund_id] = {
        period: row.period,
        accession: row.accession,
        filedAt: row.filed_at,
        checkedAt: row.checked_at,
        reportingCik: row.reporting_cik,
        sourceUrl: row.source_url,
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
