-- ============================================================================
-- Ticketflow Business Extensions Migration
-- Migration: 002_business_extensions.sql
-- Escrow Payouts, Support Tickets, Notifications, Favorites & Seat Persistence
-- ============================================================================

-- 1. PAYOUTS & ESCROW MANAGEMENT
CREATE TABLE IF NOT EXISTS payouts (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    requested_amount NUMERIC(14, 2) NOT NULL,
    commission_rate NUMERIC(5, 2) DEFAULT 5.00 NOT NULL,
    commission_amount NUMERIC(14, 2) NOT NULL,
    net_amount NUMERIC(14, 2) NOT NULL,
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(100),
    bank_account_name VARCHAR(150),
    status VARCHAR(30) DEFAULT 'REQUESTED' NOT NULL, -- 'REQUESTED', 'APPROVED', 'REJECTED', 'DISBURSED'
    notes TEXT,
    reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    disbursed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payouts_account_id ON payouts(account_id);
CREATE INDEX IF NOT EXISTS idx_payouts_event_id ON payouts(event_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);

-- 2. SUPPORT TICKETS (HELPDESK & DISPUTE MEDIATION)
CREATE TABLE IF NOT EXISTS support_tickets (
    id BIGSERIAL PRIMARY KEY,
    short_id VARCHAR(32) UNIQUE NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    event_id BIGINT REFERENCES events(id) ON DELETE SET NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_name VARCHAR(100),
    subject VARCHAR(255) NOT NULL,
    category VARCHAR(50) DEFAULT 'PAYMENT' NOT NULL, -- 'PAYMENT', 'TICKET_ISSUE', 'REFUND_REQUEST', 'CHECKIN_ISSUE', 'OTHER'
    priority VARCHAR(20) DEFAULT 'MEDIUM' NOT NULL,  -- 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
    status VARCHAR(30) DEFAULT 'OPEN' NOT NULL,      -- 'OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'
    description TEXT NOT NULL,
    evidence_url VARCHAR(500),
    resolution_notes TEXT,
    assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_short_id ON support_tickets(short_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_event_id ON support_tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- 3. SUPPORT MESSAGES
CREATE TABLE IF NOT EXISTS support_messages (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    sender_name VARCHAR(100) NOT NULL,
    sender_role VARCHAR(30) NOT NULL, -- 'ATTENDEE', 'ORGANIZER', 'ADMIN'
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);

-- 4. IN-APP NOTIFICATIONS (RESTOCK & RESTOCK TRIGGERS)
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    event_id BIGINT REFERENCES events(id) ON DELETE CASCADE,
    type VARCHAR(50) DEFAULT 'RESTOCK' NOT NULL, -- 'RESTOCK', 'SCHEDULE_CHANGE', 'REFUND', 'TICKET_TRANSFER', 'SYSTEM'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- 5. EVENT FAVORITES
CREATE TABLE IF NOT EXISTS event_favorites (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_user_event_favorite UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_favorites_user_id ON event_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_event_favorites_event_id ON event_favorites(event_id);

-- 6. PERSISTENT SEAT ALLOCATIONS
CREATE TABLE IF NOT EXISTS seat_reservations (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
    seat_key VARCHAR(50) NOT NULL,
    status VARCHAR(30) DEFAULT 'LOCKED' NOT NULL, -- 'LOCKED', 'OCCUPIED', 'RESERVED_VIP'
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_event_seat UNIQUE (event_id, seat_key)
);

CREATE INDEX IF NOT EXISTS idx_seat_reservations_event_id ON seat_reservations(event_id);
CREATE INDEX IF NOT EXISTS idx_seat_reservations_order_id ON seat_reservations(order_id);
