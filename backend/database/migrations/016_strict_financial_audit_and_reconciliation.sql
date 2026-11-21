-- ============================================================================
-- TicketFlow Migration: 016_strict_financial_audit_and_reconciliation.sql
-- Description:
--   Enforces strict verification status for payment gateway references (V9-08, V9-09).
--   Adds provider_ref_verified flag to distinguish authenticated gateway transactions
--   from mock/backfilled legacy entries.
--   Adds querydr verification tracking to refund_requests (V9-02, V9-04, V9-05).
--   Preserves currency normalization audit trail integrity (V9-14).
-- ============================================================================

-- 1. Orders table extensions for verified payment gateway transactions
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_ref_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_audit_note TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_provider_ref_verified ON orders(provider_ref_verified);

-- 2. Distinguish authenticated provider references from synthetic/legacy references
-- Mark provider_ref_verified = TRUE ONLY for genuine numeric/alphanumeric gateway IDs
-- that are not synthetic test strings (V9-08, V9-09)
UPDATE orders
SET provider_ref_verified = TRUE
WHERE payment_transaction_id IS NOT NULL
  AND payment_transaction_id !~ '^(TXN-VNPAY-|MOCK-|TEST-|FAKE-)'
  AND status IN ('PAID', 'COMPLETED', 'REFUNDED');

-- Mark synthetic and legacy mock transactions as unverified for manual review
UPDATE orders
SET provider_ref_verified = FALSE,
    settlement_audit_note = 'Legacy / mock transaction: requires authoritative provider querydr verification before production refund'
WHERE provider_ref_verified IS NOT TRUE
  AND (payment_transaction_id ~ '^(TXN-VNPAY-|MOCK-|TEST-|FAKE-)' OR payment_transaction_id IS NULL);

-- 3. Refund requests table extensions for querydr correlation
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS verified_by_querydr BOOLEAN DEFAULT FALSE;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_refund_requests_verified_querydr ON refund_requests(verified_by_querydr);

-- 4. Currency normalization audit verification (V9-14)
-- Explicitly log audit verification checkpoint for V9 strict compliance
INSERT INTO currency_normalization_audit (order_id, old_currency, new_currency, total_gross, reason)
SELECT id, currency, 'VND', total_gross, 'Migration 016 audit checkpoint: strict financial reconciliation schema applied'
FROM orders
WHERE currency = 'VND'
  AND id NOT IN (SELECT order_id FROM currency_normalization_audit WHERE reason LIKE 'Migration 016%')
LIMIT 100
ON CONFLICT DO NOTHING;
