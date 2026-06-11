import { DateTime } from 'luxon';
import type { IUserPreferencesRepository } from '../domain/repositories/IUserPreferencesRepository';
import type { IGlobalPoliciesRepository } from '../domain/repositories/IGlobalPoliciesRepository';
import type { EvaluationRequest, EvaluationResult } from '../domain/entities';
import { isMarketingType, DENY_REASONS } from '../domain/types';

// Quiet-hours helper (pure, easily unit-tested)

/**
 * Returns true when `datetime` (UTC) falls inside the startTime/endTime window
 * expressed in `timezone`.  Handles overnight windows (e.g. 22:00 → 08:00)
 */
export function isInQuietHours(
  datetime: Date,
  startTime: string, // "HH:MM"
  endTime: string,   // "HH:MM"
  timezone: string,
): boolean {
  const dt = DateTime.fromJSDate(datetime).setZone(timezone);
  if (!dt.isValid) return false;

  const parse = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const current = dt.hour * 60 + dt.minute;
  const start = parse(startTime);
  const end = parse(endTime);

  if (start === end) return false;               // empty range -> never quiet
  if (start < end) return current >= start && current < end;  // same-day window
  return current >= start || current < end;      // overnight window (e.g. 22:00–08:00)
}

// EvaluationService

/**
 * Evaluation priority (highest wins):
 *   1. Global policies         — platform rules, cannot be overridden
 *   2. User preferences        — explicit user choice
 *   3. Default preferences     — fallback for users without explicit settings
 *   4. Quiet hours             — time-based blocking applied after type check
 */

export class EvaluationService {
  constructor(
    private readonly userPrefsRepo: IUserPreferencesRepository,
    private readonly globalPoliciesRepo: IGlobalPoliciesRepository,
  ) {}

  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    // 1. Global policies
    const matchingPolicies = await this.globalPoliciesRepo.findMatchingPolicies(
      request.notificationType,
      request.channel,
      request.region,
    );

    if (matchingPolicies.length > 0) {
      return { decision: 'deny', reason: DENY_REASONS.BLOCKED_BY_GLOBAL_POLICY };
    }

    // 2 + 3. User preferences / defaults
    const userPreferences = await this.userPrefsRepo.getUserPreferences(request.userId);
    const userPref = userPreferences.find(
      p =>
        p.notificationType === request.notificationType &&
        p.channel === request.channel,
    );

    if (userPref !== undefined) {
      if (!userPref.enabled) {
        return { decision: 'deny', reason: DENY_REASONS.DISABLED_BY_USER };
      }
      // Explicit user-level "enabled" 
      // Skip defaults, go straight to quiet hours
    } else {
      const defaults = await this.userPrefsRepo.getDefaultPreferences();
      const defaultPref = defaults.find(
        p =>
          p.notificationType === request.notificationType &&
          p.channel === request.channel,
      );

      if (defaultPref !== undefined && !defaultPref.enabled) {
        return { decision: 'deny', reason: DENY_REASONS.DISABLED_BY_DEFAULT };
      }
      // Unknown type (not in defaults either) => allow by default
    }

    // 4. Quiet hours
    const quietHours = await this.userPrefsRepo.getQuietHours(request.userId);
    if (quietHours) {
      const affectedByQuietHours =
        !quietHours.marketingOnly || isMarketingType(request.notificationType);

      if (
        affectedByQuietHours &&
        isInQuietHours(
          request.datetime,
          quietHours.startTime,
          quietHours.endTime,
          quietHours.timezone,
        )
      ) {
        return { decision: 'deny', reason: DENY_REASONS.QUIET_HOURS };
      }
    }

    return { decision: 'allow', reason: DENY_REASONS.ALLOW };
  }
}
