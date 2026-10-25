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

export const PENDING_OUTBOX_SQL = `SELECT o.*, s.email FROM email_outbox o
  JOIN subscribers s ON s.id = o.subscriber_id AND s.status = 'active'
  LEFT JOIN alert_deliveries d ON d.subscriber_id = o.subscriber_id AND d.fund_id = o.fund_id AND d.accession = o.accession
  WHERE d.id IS NULL OR d.status = 'failed' OR (d.status = 'sending' AND datetime(d.created_at) < datetime('now', '-30 minutes'))
  ORDER BY o.created_at LIMIT 25`;
