-- ============================================================================
-- TicketFlow Migration: 017_evidence_based_reconciliation_and_escrow_recovery.sql
-- Description:
--   Remediates Audit V10 findings:
--   - V10-P0-03: Escrow deficit modeling and recovery ledger (prevents ledger divergence on settled refunds)
--   - V10-P1-03 & V10-P1-05: Reset speculative regex-based verification; establish authoritative verification_source
--   - V10-P2-01 & V10-P2-02: Comprehensive historical financial audit checkpoint covering all historical orders without LIMIT
-- ============================================================================

-- 1. Escrow deficit recovery tracking & deficit ledger (V10-P0-03)
ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS deficit_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS deficit_occurred_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE escrow_accounts DROP CONSTRAINT IF EXISTS chk_escrow_payout_status;
ALTER TABLE escrow_accounts ADD CONSTRAINT chk_escrow_payout_status 
  CHECK (payout_status IN ('HOLDING', 'REQUESTED', 'APPROVED', 'RELEASED', 'DISPUTED', 'DEFICIT_RECOVERY'));

CREATE TABLE IF NOT EXISTS escrow_deficit_ledger (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL,
  order_id BIGINT,
  refund_request_id BIGINT,
  refund_amount NUMERIC(15, 2) NOT NULL,
  balance_before NUMERIC(15, 2) NOT NULL,
  balance_after NUMERIC(15, 2) NOT NULL,
  shortage_amount NUMERIC(15, 2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrow_deficit_ledger_event_id ON escrow_deficit_ledger(event_id);
CREATE INDEX IF NOT EXISTS idx_escrow_deficit_ledger_order_id ON escrow_deficit_ledger(order_id);

-- 2. Evidence-based verification source for payment gateway references (V10-P1-03, V10-P1-05)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS verification_source VARCHAR(64) DEFAULT 'UNVERIFIED_LEGACY';
CREATE INDEX IF NOT EXISTS idx_orders_verification_source ON orders(verification_source);

-- Reset speculative provider_ref_verified flags from regex heuristics
-- Only mark verified if authenticated by live webhook or querydr evidence
UPDATE orders
SET provider_ref_verified = FALSE,
    verification_source = 'UNVERIFIED_LEGACY',
    settlement_audit_note = 'Reset by Migration 017: Speculative regex verification removed. Requires authenticated gateway webhook or querydr evidence.'
WHERE (verification_source IS NULL OR verification_source = 'UNVERIFIED_LEGACY')
  AND (settlement_audit_note LIKE '%Migration 016%' OR settlement_audit_note IS NULL);

-- 3. Comprehensive historical financial audit checkpoint covering ALL historical records without LIMIT (V10-P2-02)
INSERT INTO currency_normalization_audit (order_id, old_currency, new_currency, total_gross, reason)
SELECT id, COALESCE(currency, 'VND'), 'VND', total_gross, 'Migration 017 audit checkpoint: evidence-based historical financial audit applied'
FROM orders
WHERE id NOT IN (SELECT order_id FROM currency_normalization_audit WHERE reason LIKE 'Migration 017%')
ON CONFLICT DO NOTHING;
