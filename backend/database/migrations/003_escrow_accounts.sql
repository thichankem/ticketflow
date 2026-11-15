-- ============================================================================
-- TicketFlow Relational Schema Extension: Escrow Subsystem & Domain Extensions
-- Migration: 003_escrow_accounts.sql
-- Canonical Specification: SPEC.md v3.0.0-RELEASE (Section 4.2, 4.5, 4.6, 4.9)
-- Resolves Defects: DEF-DB-01, DEF-API-04, DEF-LOGIC-02, DEF-ARCH-01
-- Compatible with PostgreSQL 14+, Supabase PgBouncer Transaction Pooling
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ESCROW_ACCOUNTS TABLE
-- Tracks cumulative ticket revenue, refunds, current holding balance, and
-- platform commission per event to guarantee fund safety (SPEC.md Section 4.6).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escrow_accounts (
    event_id BIGINT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    gross_revenue NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    refunded_amount NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    current_balance NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    commission_held NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    payout_status VARCHAR(20) DEFAULT 'HOLDING' NOT NULL, -- 'HOLDING', 'REQUESTED', 'APPROVED', 'RELEASED', 'DISPUTED'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_escrow_gross_revenue CHECK (gross_revenue >= 0.00),
    CONSTRAINT chk_escrow_refunded_amount CHECK (refunded_amount >= 0.00),
    CONSTRAINT chk_escrow_current_balance CHECK (current_balance >= 0.00),
    CONSTRAINT chk_escrow_commission_held CHECK (commission_held >= 0.00),
    CONSTRAINT chk_escrow_payout_status CHECK (payout_status IN ('HOLDING', 'REQUESTED', 'APPROVED', 'RELEASED', 'DISPUTED'))
);

CREATE INDEX IF NOT EXISTS idx_escrow_accounts_payout_status ON escrow_accounts(payout_status);

-- ----------------------------------------------------------------------------
-- 2. ESCROW_PAYOUTS TABLE
-- Dedicated withdrawal ledger for organizer payout disbursements with bank info
-- payload and audit verification notes (SPEC.md Section 4.6 & Section 5.4).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escrow_payouts (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organizer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_requested NUMERIC(15, 2) NOT NULL,
    commission_fee NUMERIC(15, 2) NOT NULL,
    net_payout NUMERIC(15, 2) NOT NULL,
    bank_info JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_escrow_payouts_amount_requested CHECK (amount_requested > 0.00),
    CONSTRAINT chk_escrow_payouts_commission_fee CHECK (commission_fee >= 0.00),
    CONSTRAINT chk_escrow_payouts_net_payout CHECK (net_payout >= 0.00),
    CONSTRAINT chk_escrow_payouts_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'))
);

CREATE INDEX IF NOT EXISTS idx_escrow_payouts_event_id ON escrow_payouts(event_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payouts_organizer_id ON escrow_payouts(organizer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payouts_status ON escrow_payouts(status);

-- ----------------------------------------------------------------------------
-- 3. DOMAIN EXTENSIONS: EVENTS TABLE
-- Adds missing specification attributes for province matching, locations,
-- tags, refund policies, and commission rate (DEF-API-04, SPEC.md Section 4.2).
-- ----------------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS province_code VARCHAR(10) DEFAULT 'HCM';
ALTER TABLE events ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS refund_policy JSONB DEFAULT '{"allow_refund": true, "max_days_after_purchase": 3, "min_days_before_event": 3, "refund_percentage": 100}'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(4, 2) DEFAULT 5.00;
ALTER TABLE events ADD COLUMN IF NOT EXISTS blog_content JSONB DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS pdf_attachments JSONB DEFAULT '[]'::jsonb;

-- Backfill existing legacy events with standard defaults and location synchronization
UPDATE events 
SET 
    location_name = COALESCE(location_name, location, 'TP. Hồ Chí Minh'),
    province_code = COALESCE(province_code, 'HCM'),
    tags = COALESCE(tags, ARRAY['Sự kiện', category]),
    refund_policy = COALESCE(refund_policy, '{"allow_refund": true, "max_days_after_purchase": 3, "min_days_before_event": 3, "refund_percentage": 100}'::jsonb),
    commission_rate = COALESCE(commission_rate, 5.00)
WHERE location_name IS NULL OR province_code IS NULL OR tags IS NULL OR refund_policy IS NULL OR commission_rate IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_province_code ON events(province_code);
CREATE INDEX IF NOT EXISTS idx_events_status_start ON events(status, start_date);

-- ----------------------------------------------------------------------------
-- 4. DOMAIN EXTENSIONS: ATTENDEES TABLE
-- Adds ticket transfer traceability and barcode historical indexing
-- to enforce anti-passback and prevent scan fraud (DEF-LOGIC-02, SPEC.md Section 4.5).
-- ----------------------------------------------------------------------------
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS previous_barcode VARCHAR(100);
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS is_transferred BOOLEAN DEFAULT FALSE;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS transfer_to_email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_attendees_previous_barcode ON attendees(previous_barcode);

-- ----------------------------------------------------------------------------
-- 5. SEED / BACKFILL ESCROW ACCOUNTS FOR EXISTING EVENTS
-- Computes initial ledger balances for all existing events based on historical
-- completed and refunded orders.
-- ----------------------------------------------------------------------------
INSERT INTO escrow_accounts (event_id, gross_revenue, refunded_amount, current_balance, commission_held, payout_status, updated_at)
SELECT 
    e.id AS event_id,
    COALESCE(SUM(CASE WHEN o.status IN ('COMPLETED', 'PAID', 'REFUNDED') THEN o.total_gross ELSE 0 END), 0.00) AS gross_revenue,
    COALESCE(SUM(CASE WHEN o.status = 'REFUNDED' THEN COALESCE(o.total_refunded, o.total_gross) ELSE 0 END), 0.00) AS refunded_amount,
    GREATEST(0.00, COALESCE(SUM(CASE WHEN o.status IN ('COMPLETED', 'PAID', 'REFUNDED') THEN o.total_gross ELSE 0 END), 0.00) - COALESCE(SUM(CASE WHEN o.status = 'REFUNDED' THEN COALESCE(o.total_refunded, o.total_gross) ELSE 0 END), 0.00)) AS current_balance,
    GREATEST(0.00, ROUND(GREATEST(0.00, COALESCE(SUM(CASE WHEN o.status IN ('COMPLETED', 'PAID', 'REFUNDED') THEN o.total_gross ELSE 0 END), 0.00) - COALESCE(SUM(CASE WHEN o.status = 'REFUNDED' THEN COALESCE(o.total_refunded, o.total_gross) ELSE 0 END), 0.00)) * (COALESCE(e.commission_rate, 5.00) / 100.0), 2)) AS commission_held,
    'HOLDING' AS payout_status,
    CURRENT_TIMESTAMP AS updated_at
FROM events e
LEFT JOIN orders o ON o.event_id = e.id
GROUP BY e.id, e.commission_rate
ON CONFLICT (event_id) DO NOTHING;
