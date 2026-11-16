-- ============================================================================
-- TicketFlow Migration 006: Audit Remediation Schema Hardening
-- 1. Add missing payment_transaction_id to orders table
-- 2. Add barcode_history to attendees table for multi-hop transfer audit
-- 3. Add safety CHECK constraints for inventory and escrow integrity
-- ============================================================================

-- 1. Orders table: add payment_transaction_id column
ALTER TABLE "public"."orders" 
ADD COLUMN IF NOT EXISTS payment_transaction_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_orders_payment_transaction_id 
ON "public"."orders"(payment_transaction_id);

-- 2. Attendees table: add barcode_history column
ALTER TABLE "public"."attendees"
ADD COLUMN IF NOT EXISTS barcode_history JSONB DEFAULT '[]'::jsonb;

-- 3. Safety check constraints (idempotent DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_ticket_tiers_remaining_non_negative'
  ) THEN
    ALTER TABLE "public"."ticket_tiers" 
    ADD CONSTRAINT check_ticket_tiers_remaining_non_negative 
    CHECK (remaining_quantity >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_escrow_current_balance_non_negative'
  ) THEN
    ALTER TABLE "public"."escrow_accounts" 
    ADD CONSTRAINT check_escrow_current_balance_non_negative 
    CHECK (current_balance >= 0);
  END IF;
END $$;
