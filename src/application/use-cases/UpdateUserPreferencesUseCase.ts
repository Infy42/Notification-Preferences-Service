import type { IUserPreferencesRepository } from '../../domain/repositories/IUserPreferencesRepository';
import type { UserPreferencesView } from '../../domain/entities';
import type { NotificationType, Channel } from '../../domain/types';
import { GetUserPreferencesUseCase } from './GetUserPreferencesUseCase';

export interface UpdatePreferencesInput {
  userId: string;
  /** Zero or more per-channel preference toggles. Each is applied as an upsert. */
  preferences?: Array<{
    notificationType: NotificationType;
    channel: Channel;
    enabled: boolean;
  }>;
  /**
   * Quiet-hours configuration.
   * - Omit / undefined  → no change to quiet hours
   * - null              → delete quiet hours (disables the feature)
   * - object            → upsert quiet hours
   */
  quietHours?:
    | {
        startTime: string;
        endTime: string;
        timezone: string;
        marketingOnly?: boolean;
      }
    | null;
}

export class UpdateUserPreferencesUseCase {
  private readonly getUseCase: GetUserPreferencesUseCase;

  constructor(private readonly userPrefsRepo: IUserPreferencesRepository) {
    this.getUseCase = new GetUserPreferencesUseCase(userPrefsRepo);
  }

  async execute(input: UpdatePreferencesInput): Promise<UserPreferencesView> {
    const { userId, preferences, quietHours } = input;

    // Upsert each preference change (idempotent via ON CONFLICT DO UPDATE)
    if (preferences && preferences.length > 0) {
      await Promise.all(
        preferences.map(p =>
          this.userPrefsRepo.upsertUserPreference(
            userId,
            p.notificationType,
            p.channel,
            p.enabled,
          ),
        ),
      );
    }

    // Handle quiet hours
    if (quietHours === null) {
      await this.userPrefsRepo.deleteQuietHours(userId);
    } else if (quietHours !== undefined) {
      await this.userPrefsRepo.upsertQuietHours({
        userId,
        startTime: quietHours.startTime,
        endTime: quietHours.endTime,
        timezone: quietHours.timezone,
        marketingOnly: quietHours.marketingOnly ?? true,
      });
    }

    return this.getUseCase.execute(userId);
  }
}
