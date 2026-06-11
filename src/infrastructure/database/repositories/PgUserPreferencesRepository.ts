import type { Pool } from 'pg';
import type { IUserPreferencesRepository } from '../../../domain/repositories/IUserPreferencesRepository';
import type { UserPreference, QuietHoursConfig, DefaultPreference } from '../../../domain/entities';
import type { NotificationType, Channel } from '../../../domain/types';

export class PgUserPreferencesRepository implements IUserPreferencesRepository {
  constructor(private readonly pool: Pool) {}

  async getUserPreferences(userId: string): Promise<UserPreference[]> {
    const { rows } = await this.pool.query<{
      user_id: string;
      notification_type: string;
      channel: string;
      enabled: boolean;
      updated_at: Date;
    }>(
      `SELECT user_id, notification_type, channel, enabled, updated_at
       FROM user_preferences
       WHERE user_id = $1`,
      [userId],
    );

    return rows.map(r => ({
      userId: r.user_id,
      notificationType: r.notification_type as NotificationType,
      channel: r.channel as Channel,
      enabled: r.enabled,
      updatedAt: r.updated_at,
    }));
  }

  async upsertUserPreference(
    userId: string,
    notificationType: NotificationType,
    channel: Channel,
    enabled: boolean,
  ): Promise<UserPreference> {
    const { rows } = await this.pool.query<{
      user_id: string;
      notification_type: string;
      channel: string;
      enabled: boolean;
      updated_at: Date;
    }>(
      `INSERT INTO user_preferences (user_id, notification_type, channel, enabled, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, notification_type, channel)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
       RETURNING *`,
      [userId, notificationType, channel, enabled],
    );

    const r = rows[0];
    return {
      userId: r.user_id,
      notificationType: r.notification_type as NotificationType,
      channel: r.channel as Channel,
      enabled: r.enabled,
      updatedAt: r.updated_at,
    };
  }

  async getDefaultPreferences(): Promise<DefaultPreference[]> {
    const { rows } = await this.pool.query<{
      notification_type: string;
      channel: string;
      enabled: boolean;
    }>(`SELECT notification_type, channel, enabled FROM default_preferences ORDER BY notification_type, channel`);

    return rows.map(r => ({
      notificationType: r.notification_type as NotificationType,
      channel: r.channel as Channel,
      enabled: r.enabled,
    }));
  }

  async getQuietHours(userId: string): Promise<QuietHoursConfig | null> {
    const { rows } = await this.pool.query<{
      user_id: string;
      start_time: string;
      end_time: string;
      timezone: string;
      marketing_only: boolean;
      updated_at: Date;
    }>(
      `SELECT user_id, start_time, end_time, timezone, marketing_only, updated_at
       FROM user_quiet_hours
       WHERE user_id = $1`,
      [userId],
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      userId: r.user_id,
      startTime: r.start_time,
      endTime: r.end_time,
      timezone: r.timezone,
      marketingOnly: r.marketing_only,
      updatedAt: r.updated_at,
    };
  }

  async upsertQuietHours(config: Omit<QuietHoursConfig, 'updatedAt'>): Promise<QuietHoursConfig> {
    const { rows } = await this.pool.query<{
      user_id: string;
      start_time: string;
      end_time: string;
      timezone: string;
      marketing_only: boolean;
      updated_at: Date;
    }>(
      `INSERT INTO user_quiet_hours (user_id, start_time, end_time, timezone, marketing_only, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         start_time     = EXCLUDED.start_time,
         end_time       = EXCLUDED.end_time,
         timezone       = EXCLUDED.timezone,
         marketing_only = EXCLUDED.marketing_only,
         updated_at     = NOW()
       RETURNING *`,
      [config.userId, config.startTime, config.endTime, config.timezone, config.marketingOnly],
    );

    const r = rows[0];
    return {
      userId: r.user_id,
      startTime: r.start_time,
      endTime: r.end_time,
      timezone: r.timezone,
      marketingOnly: r.marketing_only,
      updatedAt: r.updated_at,
    };
  }

  async deleteQuietHours(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM user_quiet_hours WHERE user_id = $1', [userId]);
  }
}
