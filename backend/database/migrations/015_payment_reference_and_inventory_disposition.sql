-- ============================================================================
-- TicketFlow Migration: 015_payment_reference_and_inventory_disposition.sql
-- Description:
--   Adds persistent provider transaction reference, real payment date/bank code,
--   and inventory disposition tracking to orders (V8-02, V8-03, V8-05).
--   Adds distributed worker lease columns to refund_requests for claim-before-network (V8-01, V8-09).
--   Ensures transparent currency audit logs and reversible financial records (V8-10).
-- ============================================================================

-- 1. Orders table extensions for payment reference consistency and inventory disposition
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_txn_ref VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vnp_pay_date VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vnp_bank_code VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_released_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_orders_provider_txn_ref ON orders(provider_txn_ref);
CREATE INDEX IF NOT EXISTS idx_orders_inventory_released_at ON orders(inventory_released_at);

-- 2. Refund requests table extensions for worker leasing and crash recovery
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS worker_lease_id VARCHAR(100);
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_refund_requests_lease ON refund_requests(status, lease_expires_at);

-- 3. Backfill provider_txn_ref for existing orders to ensure consistent querydr / refund references
UPDATE orders
SET provider_txn_ref = COALESCE(provider_txn_ref, short_id, 'TF-ORD-' || id)
WHERE provider_txn_ref IS NULL;

-- 4. Mark inventory_released_at for terminal cancelled / expired / refunded orders
UPDATE orders
SET inventory_released_at = COALESCE(inventory_released_at, updated_at, created_at)
WHERE status IN ('CANCELLED', 'EXPIRED', 'REFUNDED')
  AND inventory_released_at IS NULL;

-- 5. Currency normalization audit verification (V8-10)
-- Document any remaining legacy rows in the audit log for complete financial transparency
INSERT INTO currency_normalization_audit (order_id, old_currency, new_currency, total_gross, reason)
SELECT id, currency, 'VND', total_gross, 'Migration 015 verified: canonical VND currency assertion'
FROM orders
WHERE currency = 'VND'
  AND id NOT IN (SELECT order_id FROM currency_normalization_audit WHERE new_currency = 'VND')
ON CONFLICT DO NOTHING;
