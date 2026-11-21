-- ============================================================================
-- TicketFlow Migration: 012_durable_refund_requests_and_outbox.sql
-- Description:
--   Creates dedicated durable refund requests table for transactional outbox,
--   immutable provider request references, and financial reconciliation. (TF-V4-F02, TF-V4-F13)
-- ============================================================================

CREATE TABLE IF NOT EXISTS refund_requests (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  idempotency_key VARCHAR(120) NOT NULL UNIQUE,
  provider VARCHAR(50) NOT NULL DEFAULT 'VNPAY',
  amount NUMERIC(15, 2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
  provider_request_id VARCHAR(120),
  provider_response_id VARCHAR(120),
  provider_response_code VARCHAR(30),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_order_id ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
