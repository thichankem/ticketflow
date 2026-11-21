-- ============================================================================
-- TicketFlow Migration: 011_refund_idempotency_unique_constraint.sql
-- Description:
--   Enforces unique constraint on non-null refund idempotency keys to prevent
--   concurrent or duplicate gateway settlements for the same financial request.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_refund_idempotency_key 
ON orders(refund_idempotency_key) 
WHERE refund_idempotency_key IS NOT NULL;
