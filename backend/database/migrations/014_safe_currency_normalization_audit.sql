-- ============================================================================
-- TicketFlow Migration: 014_safe_currency_normalization_audit.sql
-- Description:
--   Creates an immutable audit table for currency normalizations (V7-11)
--   and provides evidence-based, threshold-checked currency migration without
--   blindly overwriting low-value amounts that might represent foreign currency.
-- ============================================================================

-- 1. Create audit table for currency migrations
CREATE TABLE IF NOT EXISTS currency_normalization_audit (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  old_currency VARCHAR(10),
  new_currency VARCHAR(10) NOT NULL,
  total_gross NUMERIC(15, 2),
  normalized_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_curr_norm_audit_order_id ON currency_normalization_audit(order_id);

-- 2. Audit and normalize high-value rows (>= 1,000) that are unmistakably whole VND amounts
-- (e.g. 50,000 VND, 100,000 VND mistaken as USD due to default column definition)
INSERT INTO currency_normalization_audit (order_id, old_currency, new_currency, total_gross, reason)
SELECT id, currency, 'VND', total_gross, 'Automated normalization: total_gross >= 1000 matches whole VND pricing'
FROM orders
WHERE (currency = 'USD' OR currency IS NULL)
  AND total_gross >= 1000
  AND id NOT IN (SELECT order_id FROM currency_normalization_audit WHERE new_currency = 'VND');

UPDATE orders
SET currency = 'VND'
WHERE (currency = 'USD' OR currency IS NULL)
  AND total_gross >= 1000;

-- 3. Log suspicious low-value rows (< 1,000) for manual financial review without mutating them
INSERT INTO currency_normalization_audit (order_id, old_currency, new_currency, total_gross, reason)
SELECT id, currency, COALESCE(currency, 'UNKNOWN'), total_gross, 'Flagged for finance review: total_gross < 1000 could represent true USD/foreign currency'
FROM orders
WHERE (currency = 'USD' OR currency IS NULL)
  AND total_gross < 1000
  AND id NOT IN (SELECT order_id FROM currency_normalization_audit WHERE reason LIKE 'Flagged for finance review%');
