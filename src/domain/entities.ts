import type { NotificationType, Channel, Region, Decision } from './types';

// Stored entities

/** A user's explicit override for a single notification-type × channel pair */
export interface UserPreference {
  userId: string;
  notificationType: NotificationType;
  channel: Channel;
  enabled: boolean;
  updatedAt: Date;
}

/**
 * Platform-wide quiet hours for a user
 * During this window, `marketingOnly` controls whether transactional
 * notifications still go through (default: marketing only)
 */
export interface QuietHoursConfig {
  userId: string;
  startTime: string;    // "HH:MM" in 24-hour format
  endTime: string;      // "HH:MM" in 24-hour format (may be < startTime for overnight)
  timezone: string;     // IANA timezone identifier, e.g. "Europe/Moscow"
  marketingOnly: boolean;
  updatedAt: Date;
}

/** Seed-data entry; cannot be overwritten per-user without creating a UserPreference */
export interface DefaultPreference {
  notificationType: NotificationType;
  channel: Channel;
  enabled: boolean;
}

/**
 * Platform-level rule that cannot be overridden by individual users.
 * `notificationType` or `channel` being null means "applies to all"
 */
export interface GlobalPolicy {
  id: string;
  notificationType: NotificationType | null;
  channel: Channel | null;
  region: Region;   // Use 'GLOBAL' for platform-wide rules
  action: 'deny';
  reason: string;
  isActive: boolean;
  createdAt: Date;
}

// Use-case I/O

export interface EvaluationRequest {
  userId: string;
  notificationType: NotificationType;
  channel: Channel;
  region: Region;
  datetime: Date;
}

export interface EvaluationResult {
  decision: Decision;
  reason: string;
}

/** Merged view returned to callers - merges user overrides on top of defaults */
export interface UserPreferencesView {
  userId: string;
  preferences: Array<{
    notificationType: NotificationType;
    channel: Channel;
    enabled: boolean;
    /** 'user' when the user has an explicit override, otherwise 'default' */
    source: 'user' | 'default';
  }>;
  quietHours: Omit<QuietHoursConfig, 'userId' | 'updatedAt'> | null;
}
