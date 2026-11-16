-- ============================================================================
-- TicketFlow Migration 005: Add phone column to users table
-- Enables user profile phone number storage and management
-- ============================================================================

ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_users_phone ON "public"."users"(phone);
