-- ============================================================================
-- TicketFlow Migration: 010_persistent_guest_secrets_and_refund_hardening.sql
-- Description:
--   1. Adds persistent cryptographic guest capability hash column to orders table.
--   2. Adds refund tracking columns and idempotency key for financial reconciliation.
-- ============================================================================

-- 1. Persistent Guest Session Secret Hash (TF-V3-P0-03 / TF-V3-P1-02)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_secret_hash VARCHAR(64);

-- 2. Refund State Tracking & Idempotency Key (TF-V3-P0-01 / TF-V3-P0-08)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status VARCHAR(30) DEFAULT 'NONE';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_idempotency_key VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_gateway_ref VARCHAR(100);

-- 3. Indexes for fast lookup and unique idempotency
CREATE INDEX IF NOT EXISTS idx_orders_session_secret_hash ON orders(session_secret_hash);
CREATE INDEX IF NOT EXISTS idx_orders_refund_idempotency_key ON orders(refund_idempotency_key);
