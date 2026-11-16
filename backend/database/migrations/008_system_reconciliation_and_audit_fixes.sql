-- ============================================================================
-- TicketFlow Migration 008: System Reconciliation & Audit Fixes
-- Separates user suspension from deletion, adds indexing, and ensures
-- support ticket and attendee status integrity.
-- ============================================================================

-- 1. Add is_suspended to users table to decouple suspension from soft-deletion (SPEC-ISSUE-012)
ALTER TABLE "public"."users" 
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_suspended 
ON "public"."users"(is_suspended);

-- 2. Ensure attendees status index covers TRANSFERRED and CHECKED_IN
CREATE INDEX IF NOT EXISTS idx_attendees_status_event
ON "public"."attendees"(event_id, status);
