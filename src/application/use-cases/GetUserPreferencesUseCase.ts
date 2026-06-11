import type { IUserPreferencesRepository } from '../../domain/repositories/IUserPreferencesRepository';
import type { UserPreferencesView } from '../../domain/entities';

export class GetUserPreferencesUseCase {
  constructor(private readonly userPrefsRepo: IUserPreferencesRepository) {}

  async execute(userId: string): Promise<UserPreferencesView> {
    const [defaults, userPreferences, quietHours] = await Promise.all([
      this.userPrefsRepo.getDefaultPreferences(),
      this.userPrefsRepo.getUserPreferences(userId),
      this.userPrefsRepo.getQuietHours(userId),
    ]);

    // Index user overrides by "type:channel" for O(1) lookup
    const userPrefMap = new Map<string, boolean>();
    for (const pref of userPreferences) {
      userPrefMap.set(`${pref.notificationType}:${pref.channel}`, pref.enabled);
    }

    // Start with the full defaults grid, applying user overrides
    const preferences: UserPreferencesView['preferences'] = defaults.map(def => {
      const key = `${def.notificationType}:${def.channel}`;
      const userEnabled = userPrefMap.get(key);
      return {
        notificationType: def.notificationType,
        channel: def.channel,
        enabled: userEnabled !== undefined ? userEnabled : def.enabled,
        source: userEnabled !== undefined ? 'user' : 'default',
      };
    });

    // Append any user preferences for notification types not in the defaults grid
    // (forward-compat: new types can appear before defaults are updated)
    const defaultKeys = new Set(defaults.map(d => `${d.notificationType}:${d.channel}`));
    for (const pref of userPreferences) {
      const key = `${pref.notificationType}:${pref.channel}`;
      if (!defaultKeys.has(key)) {
        preferences.push({
          notificationType: pref.notificationType,
          channel: pref.channel,
          enabled: pref.enabled,
          source: 'user',
        });
      }
    }

    return {
      userId,
      preferences,
      quietHours: quietHours
        ? {
            startTime: quietHours.startTime,
            endTime: quietHours.endTime,
            timezone: quietHours.timezone,
            marketingOnly: quietHours.marketingOnly,
          }
        : null,
    };
  }
}
