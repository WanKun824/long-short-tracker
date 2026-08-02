export const DELIVERY_CLAIM_SQL = `INSERT INTO alert_deliveries
  (subscriber_id, fund_id, accession, provider_id, status, error)
  VALUES (?, ?, ?, NULL, 'sending', NULL)
  ON CONFLICT(subscriber_id, fund_id, accession) DO UPDATE SET
    provider_id = NULL,
    status = 'sending',
    error = NULL,
    created_at = CURRENT_TIMESTAMP
  WHERE alert_deliveries.status = 'failed'
    OR (alert_deliveries.status = 'sending'
      AND datetime(alert_deliveries.created_at) < datetime('now', '-30 minutes'))`;
