-- TicketFlow Migration: 018_create_reports_module.sql
-- Implements reporting system for Attendees and Organizers with Admin review & resolution.

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_name VARCHAR(255),
  reporter_email VARCHAR(255),
  reporter_role VARCHAR(50) DEFAULT 'ATTENDEE',
  target_type VARCHAR(50) NOT NULL, -- 'EVENT', 'ATTENDEE', 'USER', 'SYSTEM'
  target_id VARCHAR(100),           -- Event ID, Attendee ID, or User ID
  target_title VARCHAR(255),        -- Event title, Attendee name, etc.
  reason VARCHAR(100) NOT NULL,     -- 'FRAUD', 'INAPPROPRIATE', 'MISLEADING', 'COPYRIGHT', 'POLICY_VIOLATION', 'TECHNICAL', 'OTHER'
  description TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'
  admin_notes TEXT,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
