export const ACQUIRE_REFRESH_LOCK_SQL = `INSERT INTO refresh_locks (name, owner, expires_at)
  VALUES ('daily_refresh', ?, ?)
  ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
  WHERE refresh_locks.expires_at <= ?`;

export async function expireStaleRefreshRuns(db: D1Database) {
  await db.prepare(`UPDATE refresh_runs SET status = 'timed_out', completed_at = CURRENT_TIMESTAMP,
    error = 'Task interrupted or exceeded its 20-minute limit',
    reason = 'Task interrupted or exceeded its 20-minute limit'
    WHERE status = 'running' AND datetime(started_at) < datetime('now', '-20 minutes')`).run();
}
