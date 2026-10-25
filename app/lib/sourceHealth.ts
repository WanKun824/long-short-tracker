import { getD1 } from "../../db";

export type SourceHealth = {
  source_id: string; name: string; status: string; checked_at: string;
  last_success_at: string | null; latest_article_at: string | null; article_count: number; error: string | null;
};

export async function recordSourceHealth(sourceId: string, name: string, status: string, checkedAt: string, articles: Array<{ seenDate?: string; publishedAt?: string }> = [], error: string | null = null, latestArticleAt: string | null = null) {
  const latest = latestArticleAt ?? articles.map((item) => item.seenDate ?? item.publishedAt ?? "").filter(Boolean).sort().at(-1) ?? null;
  await getD1().prepare(`INSERT INTO source_health
    (source_id, name, status, checked_at, last_success_at, latest_article_at, article_count, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET name = excluded.name, status = excluded.status,
      checked_at = excluded.checked_at,
      last_success_at = COALESCE(excluded.last_success_at, source_health.last_success_at),
      latest_article_at = COALESCE(excluded.latest_article_at, source_health.latest_article_at),
      article_count = excluded.article_count, error = excluded.error`)
    .bind(sourceId, name, status, checkedAt, status === "ok" ? checkedAt : null, latest, articles.length, error).run();
}

export async function sourceInCooldown(sourceId: string, now = Date.now()) {
  const prior = await getD1().prepare("SELECT status, checked_at, error FROM source_health WHERE source_id = ?")
    .bind(sourceId).first<Pick<SourceHealth, "status" | "checked_at" | "error">>();
  const delay = /401|402|403/.test(prior?.error ?? "") ? 7 * 86_400_000 : 86_400_000;
  return prior?.status === "error" && now - Date.parse(prior.checked_at) < delay;
}
