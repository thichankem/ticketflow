-- 007_broadcast_announcements.sql
-- Platform-wide Broadcast Announcements (Thông báo chung cho Quản trị viên sàn)

CREATE TABLE IF NOT EXISTS announcements (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'GENERAL' NOT NULL, -- 'GENERAL', 'MAINTENANCE', 'POLICY', 'PROMO'
    target_role VARCHAR(50) DEFAULT 'ALL' NOT NULL, -- 'ALL', 'ORGANIZER', 'ATTENDEE'
    recipients_count INTEGER DEFAULT 0,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcements_target_role ON announcements(target_role);
