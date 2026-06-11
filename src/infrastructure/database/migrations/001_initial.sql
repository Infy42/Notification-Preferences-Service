-- =============================================================================
-- 001_initial.sql — Notification Preferences Service schema
-- =============================================================================

-- Default preferences used for new users (no user-level override yet)
CREATE TABLE IF NOT EXISTS default_preferences (
  notification_type TEXT NOT NULL,
  channel           TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (notification_type, channel)
);

-- Per-user overrides; rows are created only when a user changes a default
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id           TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  channel           TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_type, channel)
);

-- Per-user quiet-hours configuration
CREATE TABLE IF NOT EXISTS user_quiet_hours (
  user_id        TEXT NOT NULL PRIMARY KEY,
  start_time     TEXT NOT NULL,  -- "HH:MM" 24-hour
  end_time       TEXT NOT NULL,  -- "HH:MM" 24-hour
  timezone       TEXT NOT NULL DEFAULT 'UTC',
  marketing_only BOOLEAN NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform-level policies; cannot be overridden by individual users
CREATE TABLE IF NOT EXISTS global_policies (
  id                UUID    NOT NULL PRIMARY KEY,
  notification_type TEXT,           -- NULL → applies to all notification types
  channel           TEXT,           -- NULL → applies to all channels
  region            TEXT    NOT NULL,
  action            TEXT    NOT NULL DEFAULT 'deny',
  reason            TEXT    NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_policies_region ON global_policies(region);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user  ON user_preferences(user_id);

-- =============================================================================
-- Seed: platform defaults
--   transactional / security / system → on by default
--   marketing                         → off by default
-- =============================================================================
INSERT INTO default_preferences (notification_type, channel, enabled) VALUES
  ('transactional_email', 'email', true),
  ('marketing_email',     'email', false),
  ('transactional_sms',   'sms',   true),
  ('marketing_sms',       'sms',   false),
  ('transactional_push',  'push',  true),
  ('marketing_push',      'push',  false),
  ('security_email',      'email', true),
  ('system_push',         'push',  true)
ON CONFLICT (notification_type, channel) DO NOTHING;
