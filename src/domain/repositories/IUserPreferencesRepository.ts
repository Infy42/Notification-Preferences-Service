import type { UserPreference, QuietHoursConfig, DefaultPreference } from '../entities';
import type { NotificationType, Channel } from '../types';

export interface IUserPreferencesRepository {
  /** All explicit overrides for a given user (may be empty) */
  getUserPreferences(userId: string): Promise<UserPreference[]>;

  /**
   * Create or update a single preference
   * Idempotent: calling twice with the same arguments yields the same state
   */
  upsertUserPreference(
    userId: string,
    notificationType: NotificationType,
    channel: Channel,
    enabled: boolean,
  ): Promise<UserPreference>;

  /** Platform defaults used when a user has no explicit override */
  getDefaultPreferences(): Promise<DefaultPreference[]>;

  /** Returns null if the user has not configured quiet hours */
  getQuietHours(userId: string): Promise<QuietHoursConfig | null>;

  /** Create or replace quiet-hours config */
  upsertQuietHours(
    config: Omit<QuietHoursConfig, 'updatedAt'>,
  ): Promise<QuietHoursConfig>;

  /** Remove quiet-hours config for the user. No-ops if none exists */
  deleteQuietHours(userId: string): Promise<void>;
}
