-- ============================================================================
-- TicketFlow Migration 009: Retire Helpdesk & Customer Support Schema
-- Safe Schema Retirement per Architectural Eradication Directive
-- ============================================================================

-- 1. Deprecate tables with clear schema comments (Preserve audit retention)
COMMENT ON TABLE "public"."support_tickets" IS 
  'DEPRECATED: Helpdesk module eradicated per product restructuring. Retained for audit/data retention compliance until DBA deletion approval.';

COMMENT ON TABLE "public"."support_messages" IS 
  'DEPRECATED: Helpdesk module eradicated per product restructuring. Retained for audit/data retention compliance until DBA deletion approval.';

-- 2. Drop Helpdesk-only queue and priority indexes to eliminate write overhead
DROP INDEX IF EXISTS "public"."idx_support_tickets_short_id";
DROP INDEX IF EXISTS "public"."idx_support_tickets_status";
DROP INDEX IF EXISTS "public"."idx_support_tickets_assigned_to";

-- 3. Document the pending destructive migration for DBA sign-off:
-- When legal & financial retention obligations are satisfied, the DBA can execute:
-- DROP TABLE IF EXISTS "public"."support_messages" CASCADE;
-- DROP TABLE IF EXISTS "public"."support_tickets" CASCADE;
