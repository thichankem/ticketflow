-- ============================================================================
-- Ticketflow / Hi.Events Initial Relational Schema
-- Migration: 001_initial_schema.sql
-- Compatible with PostgreSQL 14+, Supabase PgBouncer Transaction Pooling
-- ============================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. ACCOUNTS
-- Organization / tenant level boundary
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    currency_code VARCHAR(3) DEFAULT 'USD' NOT NULL,
    timezone VARCHAR(64) DEFAULT 'UTC' NOT NULL,
    short_id VARCHAR(32) UNIQUE NOT NULL,
    stripe_account_id VARCHAR(50),
    stripe_connect_setup_complete BOOLEAN DEFAULT FALSE NOT NULL,
    is_suspended BOOLEAN DEFAULT FALSE NOT NULL,
    account_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_short_id ON accounts(short_id);
CREATE INDEX IF NOT EXISTS idx_accounts_is_suspended ON accounts(is_suspended);

-- ----------------------------------------------------------------------------
-- 2. USERS
-- Global user accounts with bcrypt hashed passwords
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    role VARCHAR(30) DEFAULT 'ATTENDEE' NOT NULL, -- 'ADMIN', 'ORGANIZER', 'ATTENDEE'
    account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    timezone VARCHAR(64) DEFAULT 'UTC' NOT NULL,
    locale VARCHAR(10) DEFAULT 'en' NOT NULL,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    pending_email VARCHAR(255),
    remember_token VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ----------------------------------------------------------------------------
-- 3. ACCOUNT_USERS
-- Pivot joining Users to Accounts with RBAC roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_users (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'ORGANIZER' NOT NULL, -- 'SUPERADMIN', 'ADMIN', 'ORGANIZER', 'ATTENDEE'
    is_account_owner BOOLEAN DEFAULT FALSE NOT NULL,
    status VARCHAR(40) DEFAULT 'ACTIVE' NOT NULL, -- 'ACTIVE', 'INVITED', 'SUSPENDED'
    invited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_account_users_account_user_role UNIQUE (account_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_account_users_account_id ON account_users(account_id);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);
CREATE INDEX IF NOT EXISTS idx_account_users_role ON account_users(role);

-- ----------------------------------------------------------------------------
-- 4. ORGANIZERS
-- Public organizer profiles belonging to an account
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizers (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    website VARCHAR(255),
    description TEXT,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    timezone VARCHAR(64) DEFAULT 'UTC' NOT NULL,
    status VARCHAR(30) DEFAULT 'ACTIVE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_organizers_account_id ON organizers(account_id);

-- ----------------------------------------------------------------------------
-- 5. EVENTS
-- Event showcase, schedules, and publication states
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    short_id VARCHAR(32) UNIQUE NOT NULL,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    organizer_id BIGINT REFERENCES organizers(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(30) DEFAULT 'DRAFT' NOT NULL, -- 'DRAFT', 'LIVE', 'ARCHIVED', 'CANCELLED'
    type VARCHAR(30) DEFAULT 'SINGLE' NOT NULL,   -- 'SINGLE', 'RECURRING'
    category VARCHAR(50) DEFAULT 'MUSIC' NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    timezone VARCHAR(64) DEFAULT 'UTC' NOT NULL,
    location VARCHAR(255),
    location_details JSONB,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    ticket_quantity_available INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_events_short_id ON events(short_id);
CREATE INDEX IF NOT EXISTS idx_events_account_id ON events(account_id);
CREATE INDEX IF NOT EXISTS idx_events_organizer_id ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);

-- ----------------------------------------------------------------------------
-- 6. EVENT_SETTINGS
-- 1:1 settings configuration for checkout messages, timers, and styling
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_settings (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT UNIQUE NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    pre_checkout_message TEXT,
    post_checkout_message TEXT,
    ticket_page_message TEXT,
    continue_button_text VARCHAR(100) DEFAULT 'Continue' NOT NULL,
    email_footer_message TEXT,
    support_email VARCHAR(255),
    require_attendee_details BOOLEAN DEFAULT TRUE NOT NULL,
    attendee_details_collection_method VARCHAR(20) DEFAULT 'PER_TICKET' NOT NULL, -- 'PER_TICKET', 'PER_ORDER'
    order_timeout_in_minutes INTEGER DEFAULT 15 NOT NULL,
    price_display_mode VARCHAR(20) DEFAULT 'INCLUSIVE' NOT NULL, -- 'INCLUSIVE', 'EXCLUSIVE'
    website_url VARCHAR(400),
    maps_url VARCHAR(400),
    homepage_background_color VARCHAR(20),
    homepage_primary_color VARCHAR(20),
    payment_providers JSONB DEFAULT '["STRIPE", "OFFLINE"]'::jsonb NOT NULL,
    offline_payment_instructions TEXT,
    is_online_event BOOLEAN DEFAULT FALSE NOT NULL,
    online_event_connection_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_event_settings_event_id ON event_settings(event_id);

-- ----------------------------------------------------------------------------
-- 7. TICKET_TIERS
-- Ticket types, pricing, and atomic inventory bounds
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_tiers (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    type VARCHAR(20) DEFAULT 'PAID' NOT NULL, -- 'PAID', 'FREE', 'DONATION', 'TIERED'
    initial_quantity INTEGER NOT NULL,
    remaining_quantity INTEGER NOT NULL,
    min_per_order INTEGER DEFAULT 1 NOT NULL,
    max_per_order INTEGER DEFAULT 10 NOT NULL,
    is_hidden BOOLEAN DEFAULT FALSE NOT NULL,
    hide_when_sold_out BOOLEAN DEFAULT FALSE NOT NULL,
    show_quantity_remaining BOOLEAN DEFAULT FALSE NOT NULL,
    sort_order INTEGER DEFAULT 1 NOT NULL,
    sale_start_date TIMESTAMP WITH TIME ZONE,
    sale_end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_ticket_tiers_price CHECK (price >= 0.00),
    CONSTRAINT chk_ticket_tiers_remaining_quantity CHECK (remaining_quantity >= 0 AND remaining_quantity <= initial_quantity),
    CONSTRAINT chk_ticket_tiers_min_max CHECK (min_per_order <= max_per_order)
);

CREATE INDEX IF NOT EXISTS idx_ticket_tiers_event_id ON ticket_tiers(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_sort_order ON ticket_tiers(sort_order);
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_is_hidden ON ticket_tiers(is_hidden);

-- ----------------------------------------------------------------------------
-- 8. PROMO_CODES
-- Discount coupons with fixed or percentage deductions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_codes (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    discount_type VARCHAR(20) DEFAULT 'PERCENTAGE' NOT NULL, -- 'PERCENTAGE', 'FIXED', 'NONE'
    discount NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    discount_applies_to VARCHAR(20) DEFAULT 'EACH_PRODUCT' NOT NULL, -- 'ORDER', 'EACH_PRODUCT'
    applicable_ticket_ids JSONB,
    max_allowed_usages INTEGER,
    order_usage_count INTEGER DEFAULT 0 NOT NULL,
    attendee_usage_count INTEGER DEFAULT 0 NOT NULL,
    expiry_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_promo_codes_event_id_code UNIQUE (event_id, code),
    CONSTRAINT chk_promo_codes_discount CHECK (discount >= 0.00),
    CONSTRAINT chk_promo_codes_usage CHECK (order_usage_count >= 0 AND (max_allowed_usages IS NULL OR order_usage_count <= max_allowed_usages))
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_event_id ON promo_codes(event_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);

-- ----------------------------------------------------------------------------
-- 9. ORDERS
-- Checkout orders, reservations, payment states, and financial totals
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    short_id VARCHAR(32) UNIQUE NOT NULL,
    public_id VARCHAR(64) UNIQUE NOT NULL,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    status VARCHAR(30) DEFAULT 'RESERVED' NOT NULL, -- 'RESERVED', 'COMPLETED', 'CANCELLED', 'AWAITING_OFFLINE_PAYMENT', 'ABANDONED', 'REFUNDED'
    payment_status VARCHAR(30) DEFAULT 'AWAITING_PAYMENT' NOT NULL, -- 'NO_PAYMENT_REQUIRED', 'AWAITING_PAYMENT', 'AWAITING_OFFLINE_PAYMENT', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED'
    payment_gateway VARCHAR(50), -- 'STRIPE', 'OFFLINE', 'FREE'
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    subtotal NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    total_before_additions NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    discount_amount NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    total_tax NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    total_fee NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    total_gross NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    total_refunded NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    promo_code_id BIGINT REFERENCES promo_codes(id) ON DELETE SET NULL,
    promo_code VARCHAR(50),
    session_id VARCHAR(64),
    address JSONB,
    taxes_and_fees_rollup JSONB,
    reserved_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_orders_short_id ON orders(short_id);
CREATE INDEX IF NOT EXISTS idx_orders_public_id ON orders(public_id);
CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_promo_code_id ON orders(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_orders_reserved_until ON orders(reserved_until);

-- ----------------------------------------------------------------------------
-- 10. ORDER_ITEMS
-- Purchased ticket tiers line items linked to orders
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_tier_id BIGINT NOT NULL REFERENCES ticket_tiers(id) ON DELETE RESTRICT,
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC(14, 2) NOT NULL,
    price_before_discount NUMERIC(14, 2),
    total_before_additions NUMERIC(14, 2) NOT NULL,
    total_tax NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    total_service_fee NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
    total_gross NUMERIC(14, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_order_items_quantity CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_tier_id ON order_items(ticket_tier_id);

-- ----------------------------------------------------------------------------
-- 11. ATTENDEES
-- Individual ticket holders, QR barcodes, and check-in status
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendees (
    id BIGSERIAL PRIMARY KEY,
    short_id VARCHAR(32) UNIQUE NOT NULL,
    public_id VARCHAR(64) UNIQUE NOT NULL,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_tier_id BIGINT NOT NULL REFERENCES ticket_tiers(id) ON DELETE RESTRICT,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    first_name VARCHAR(100) DEFAULT '' NOT NULL,
    last_name VARCHAR(100) DEFAULT '' NOT NULL,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL, -- 'ACTIVE', 'CHECKED_IN', 'CANCELLED', 'AWAITING_PAYMENT'
    barcode VARCHAR(100),
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_in_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    checked_out_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_attendees_short_id ON attendees(short_id);
CREATE INDEX IF NOT EXISTS idx_attendees_public_id ON attendees(public_id);
CREATE INDEX IF NOT EXISTS idx_attendees_order_id ON attendees(order_id);
CREATE INDEX IF NOT EXISTS idx_attendees_ticket_tier_id ON attendees(ticket_tier_id);
CREATE INDEX IF NOT EXISTS idx_attendees_event_id ON attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_attendees_email ON attendees(email);
CREATE INDEX IF NOT EXISTS idx_attendees_status ON attendees(status);

-- ----------------------------------------------------------------------------
-- BACKWARD COMPATIBILITY VIEW
-- Aliases 'tickets' to 'ticket_tiers' to prevent legacy query breaks
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW tickets AS
SELECT 
    id,
    event_id,
    title,
    description,
    price,
    type,
    initial_quantity,
    remaining_quantity,
    min_per_order,
    max_per_order,
    is_hidden,
    sort_order,
    created_at,
    updated_at,
    deleted_at
FROM ticket_tiers;
