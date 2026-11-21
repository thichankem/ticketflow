-- ============================================================================
-- TicketFlow Migration: 013_normalize_currency_to_vnd.sql
-- Description:
--   Normalizes orders currency column default to 'VND' and backfills existing
--   USD defaults to match domestic payment processing. (TF-V4-F09, V6-08)
--
-- Dry-Run Verification:
--   SELECT COUNT(*) AS affected_count, MIN(total_gross) AS min_amt, MAX(total_gross) AS max_amt
--   FROM orders WHERE currency = 'USD' OR currency IS NULL;
--
-- Rollback Plan:
--   ALTER TABLE orders ALTER COLUMN currency SET DEFAULT 'USD';
-- ============================================================================

ALTER TABLE orders ALTER COLUMN currency SET DEFAULT 'VND';

-- FX-Safe Idempotent Normalization:
-- In TicketFlow, all prices and orders are denominated in whole VND units (e.g., 50,000 VND).
-- Historical rows with default 'USD' label resulted from initial schema default mismatch.
-- Backfill safely normalizes currency label to 'VND' where currency is 'USD' or NULL.
UPDATE orders 
SET currency = 'VND' 
WHERE currency = 'USD' OR currency IS NULL;
