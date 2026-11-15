-- ============================================================================
-- TicketFlow Production Hardening: Supabase RLS & Indexes
-- Migration: 004_supabase_production_hardening.sql
-- Canonical Specification: SPEC.md v3.0.0-RELEASE (Section 4.9, 6.6, 7)
-- Compatible with PostgreSQL 15+, Supabase Data API & PgBouncer Transaction Mode
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FOREIGN KEY COVERING INDEXES (Performance Advisor Remediation)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_event_id ON notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_payouts_reviewed_by ON payouts(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_id ON support_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);

-- ----------------------------------------------------------------------------
-- 2. SECURE BACKWARD-COMPATIBILITY VIEWS
-- Enforce security_invoker = true so views respect caller RLS policies
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'tickets' AND table_schema = 'public') THEN
    ALTER VIEW tickets SET (security_invoker = true);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY (RLS) ACROSS ALL EXPOSED PUBLIC TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."account_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ticket_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attendees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."support_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."seat_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."escrow_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."escrow_payouts" ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. REVOKE ANONYMOUS/AUTHENTICATED DIRECT ACCESS ON SYSTEM & MIGRATION TABLES
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."migrations" FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES FOR SUPABASE CLIENTS
-- Note: Table owner (ticketflow_app) bypasses RLS by PostgreSQL standard behavior.
-- Policies below control direct PostgREST / anon / authenticated client queries.
-- ----------------------------------------------------------------------------

-- A. EVENTS (Single SELECT policy, distinct write policies to avoid multiple permissive warnings)
DROP POLICY IF EXISTS "public_read_live_events" ON events;
DROP POLICY IF EXISTS "organizer_manage_own_events" ON events;
DROP POLICY IF EXISTS "events_select_policy" ON events;
DROP POLICY IF EXISTS "organizer_modify_own_events" ON events;
DROP POLICY IF EXISTS "organizer_insert_own_events" ON events;
DROP POLICY IF EXISTS "organizer_update_own_events" ON events;
DROP POLICY IF EXISTS "organizer_delete_own_events" ON events;

CREATE POLICY "events_select_policy" ON events
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'LIVE'
    OR user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint)
    OR (SELECT current_setting('request.jwt.claim.role', true)) = 'ADMIN'
  );

CREATE POLICY "organizer_insert_own_events" ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint)
    OR (SELECT current_setting('request.jwt.claim.role', true)) = 'ADMIN'
  );

CREATE POLICY "organizer_update_own_events" ON events
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint)
    OR (SELECT current_setting('request.jwt.claim.role', true)) = 'ADMIN'
  )
  WITH CHECK (
    user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint)
    OR (SELECT current_setting('request.jwt.claim.role', true)) = 'ADMIN'
  );

CREATE POLICY "organizer_delete_own_events" ON events
  FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint)
    OR (SELECT current_setting('request.jwt.claim.role', true)) = 'ADMIN'
  );

-- B. TICKET TIERS
DROP POLICY IF EXISTS "public_read_visible_tiers" ON ticket_tiers;
CREATE POLICY "public_read_visible_tiers" ON ticket_tiers
  FOR SELECT
  TO anon, authenticated
  USING (is_hidden = false);

-- C. ORDERS
DROP POLICY IF EXISTS "authenticated_view_own_orders" ON orders;
CREATE POLICY "authenticated_view_own_orders" ON orders
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint)
    OR (SELECT current_setting('request.jwt.claim.role', true)) = 'ADMIN'
  );

-- D. NOTIFICATIONS
DROP POLICY IF EXISTS "authenticated_view_own_notifications" ON notifications;
CREATE POLICY "authenticated_view_own_notifications" ON notifications
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint));

DROP POLICY IF EXISTS "authenticated_update_own_notifications" ON notifications;
CREATE POLICY "authenticated_update_own_notifications" ON notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint));

-- E. EVENT FAVORITES
DROP POLICY IF EXISTS "authenticated_manage_favorites" ON event_favorites;
CREATE POLICY "authenticated_manage_favorites" ON event_favorites
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint));

-- F. ESCROW ACCOUNTS
DROP POLICY IF EXISTS "organizers_view_own_escrow" ON escrow_accounts;
CREATE POLICY "organizers_view_own_escrow" ON escrow_accounts
  FOR SELECT
  TO authenticated
  USING (
    event_id IN (
      SELECT id FROM events 
      WHERE user_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint)
    )
    OR (SELECT current_setting('request.jwt.claim.role', true)) = 'ADMIN'
  );

-- G. ESCROW PAYOUTS
DROP POLICY IF EXISTS "organizers_view_own_payouts" ON escrow_payouts;
CREATE POLICY "organizers_view_own_payouts" ON escrow_payouts
  FOR SELECT
  TO authenticated
  USING (
    organizer_id = (SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::text::bigint)
    OR (SELECT current_setting('request.jwt.claim.role', true)) = 'ADMIN'
  );
