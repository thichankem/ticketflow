-- TicketFlow Migration 009: Production Supabase Storage & Media Assets
-- Tracks uploaded media files in Supabase Storage with ownership, dimensions, and metadata.

CREATE TABLE IF NOT EXISTS event_media_assets (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  bucket VARCHAR(100) NOT NULL DEFAULT 'event-images',
  storage_path VARCHAR(500) NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  media_type VARCHAR(50) NOT NULL, -- 'cover', 'banner', 'blog', 'document'
  original_filename VARCHAR(255),
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_media_assets_event_id ON event_media_assets(event_id);
CREATE INDEX IF NOT EXISTS idx_event_media_assets_account_id ON event_media_assets(account_id);
CREATE INDEX IF NOT EXISTS idx_event_media_assets_storage_path ON event_media_assets(storage_path);

-- Ensure events table has cover and banner columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS banner TEXT;
