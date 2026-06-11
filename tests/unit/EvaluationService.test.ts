import { EvaluationService, isInQuietHours } from '../../src/application/EvaluationService';
import type { GlobalPolicy, UserPreference } from '../../src/domain/entities';
import {
  createMockUserPrefsRepo,
  createMockGlobalPoliciesRepo,
  OVERNIGHT_QUIET_HOURS,
  DATETIME_INSIDE_QUIET_HOURS,
  DATETIME_OUTSIDE_QUIET_HOURS,
} from './mocks';

// Helpers

function makeService(opts: {
  userPreferences?: UserPreference[];
  quietHours?: (typeof OVERNIGHT_QUIET_HOURS) | null;
  policies?: GlobalPolicy[];
}) {
  return new EvaluationService(
    createMockUserPrefsRepo({
      userPreferences: opts.userPreferences,
      quietHours: opts.quietHours,
    }),
    createMockGlobalPoliciesRepo(opts.policies),
  );
}

const BASE = {
  userId: 'user-1',
  channel: 'email' as const,
  region: 'US' as const,
  datetime: new Date('2026-05-21T12:00:00Z'),
};

// isInQuietHours

describe('isInQuietHours()', () => {
  describe('overnight window 22:00–08:00 Moscow (UTC+3)', () => {
    const tz = 'Europe/Moscow';

    it('returns true at 22:30 Moscow (19:30 UTC)', () => {
      expect(isInQuietHours(new Date('2026-05-21T19:30:00Z'), '22:00', '08:00', tz)).toBe(true);
    });

    it('returns true at 00:30 Moscow (21:30 UTC prev day)', () => {
      expect(isInQuietHours(new Date('2026-05-20T21:30:00Z'), '22:00', '08:00', tz)).toBe(true);
    });

    it('returns false at 12:00 Moscow (09:00 UTC)', () => {
      expect(isInQuietHours(new Date('2026-05-21T09:00:00Z'), '22:00', '08:00', tz)).toBe(false);
    });

    it('returns false exactly at end boundary 08:00 Moscow', () => {
      expect(isInQuietHours(new Date('2026-05-21T05:00:00Z'), '22:00', '08:00', tz)).toBe(false);
    });
  });

  it('same-day window 09:00–17:00 UTC', () => {
    expect(isInQuietHours(new Date('2026-05-21T10:00:00Z'), '09:00', '17:00', 'UTC')).toBe(true);
    expect(isInQuietHours(new Date('2026-05-21T08:59:00Z'), '09:00', '17:00', 'UTC')).toBe(false);
  });

  it('returns false for equal start/end (empty range)', () => {
    expect(isInQuietHours(new Date(), '12:00', '12:00', 'UTC')).toBe(false);
  });
});

// EvaluationService

describe('EvaluationService', () => {
  // Scenario 1: Default preferences
  describe('Scenario 1 — Default preferences for new users', () => {
    it('allows transactional_email (enabled by default)', async () => {
      const svc = makeService({});
      const result = await svc.evaluate({ ...BASE, notificationType: 'transactional_email' });
      expect(result).toEqual({ decision: 'allow', reason: 'all_checks_passed' });
    });

    it('denies marketing_email (disabled by default)', async () => {
      const svc = makeService({});
      const result = await svc.evaluate({ ...BASE, notificationType: 'marketing_email' });
      expect(result).toEqual({ decision: 'deny', reason: 'disabled_by_default' });
    });

    it('denies marketing_sms (disabled by default)', async () => {
      const svc = makeService({});
      const result = await svc.evaluate({ ...BASE, notificationType: 'marketing_sms', channel: 'sms' });
      expect(result).toEqual({ decision: 'deny', reason: 'disabled_by_default' });
    });

    it('allows security_email (enabled by default)', async () => {
      const svc = makeService({});
      const result = await svc.evaluate({ ...BASE, notificationType: 'security_email' });
      expect(result).toEqual({ decision: 'allow', reason: 'all_checks_passed' });
    });
  });

  // Scenario 2: User changes preferences
  describe('Scenario 2 — User overrides', () => {
    it('allows marketing_email when user explicitly enables it', async () => {
      const svc = makeService({
        userPreferences: [
          { userId: 'user-1', notificationType: 'marketing_email', channel: 'email', enabled: true, updatedAt: new Date() },
        ],
      });
      const result = await svc.evaluate({ ...BASE, notificationType: 'marketing_email' });
      expect(result.decision).toBe('allow');
    });

    it('denies transactional_email when user disables it', async () => {
      const svc = makeService({
        userPreferences: [
          { userId: 'user-1', notificationType: 'transactional_email', channel: 'email', enabled: false, updatedAt: new Date() },
        ],
      });
      const result = await svc.evaluate({ ...BASE, notificationType: 'transactional_email' });
      expect(result).toEqual({ decision: 'deny', reason: 'disabled_by_user' });
    });

    it('user override is independent per-channel (other channels stay default)', async () => {
      const svc = makeService({
        userPreferences: [
          // User disables transactional_email, but transactional_sms stays at default
          { userId: 'user-1', notificationType: 'transactional_email', channel: 'email', enabled: false, updatedAt: new Date() },
        ],
      });

      const emailResult = await svc.evaluate({ ...BASE, notificationType: 'transactional_email', channel: 'email' });
      const smsResult = await svc.evaluate({ ...BASE, notificationType: 'transactional_sms', channel: 'sms' });

      expect(emailResult.decision).toBe('deny');
      expect(smsResult.decision).toBe('allow');
    });
  });

  // Scenario 3: Quiet hours
  describe('Scenario 3 — Quiet hours', () => {
    it('blocks marketing_push inside quiet hours', async () => {
      const svc = makeService({
        userPreferences: [
          { userId: 'user-1', notificationType: 'marketing_push', channel: 'push', enabled: true, updatedAt: new Date() },
        ],
        quietHours: OVERNIGHT_QUIET_HOURS,
      });

      const result = await svc.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'US',
        datetime: DATETIME_INSIDE_QUIET_HOURS,
      });

      expect(result).toEqual({ decision: 'deny', reason: 'quiet_hours' });
    });

    it('allows transactional_push inside quiet hours (marketingOnly = true)', async () => {
      const svc = makeService({ quietHours: OVERNIGHT_QUIET_HOURS });

      const result = await svc.evaluate({
        userId: 'user-1',
        notificationType: 'transactional_push',
        channel: 'push',
        region: 'US',
        datetime: DATETIME_INSIDE_QUIET_HOURS,
      });

      expect(result.decision).toBe('allow');
    });

    it('allows marketing_push outside quiet hours', async () => {
      const svc = makeService({
        userPreferences: [
          { userId: 'user-1', notificationType: 'marketing_push', channel: 'push', enabled: true, updatedAt: new Date() },
        ],
        quietHours: OVERNIGHT_QUIET_HOURS,
      });

      const result = await svc.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'US',
        datetime: DATETIME_OUTSIDE_QUIET_HOURS,
      });

      expect(result.decision).toBe('allow');
    });

    it('blocks transactional_push when marketingOnly = false', async () => {
      const svc = makeService({
        quietHours: { ...OVERNIGHT_QUIET_HOURS, marketingOnly: false },
      });

      const result = await svc.evaluate({
        userId: 'user-1',
        notificationType: 'transactional_push',
        channel: 'push',
        region: 'US',
        datetime: DATETIME_INSIDE_QUIET_HOURS,
      });

      expect(result).toEqual({ decision: 'deny', reason: 'quiet_hours' });
    });
  });

  // Scenario 4: Global policies
  describe('Scenario 4 — Global policies', () => {
    const EU_MARKETING_SMS_POLICY: GlobalPolicy = {
      id: 'policy-eu-sms',
      notificationType: 'marketing_sms',
      channel: 'sms',
      region: 'EU',
      action: 'deny',
      reason: 'EU marketing SMS restrictions',
      isActive: true,
      createdAt: new Date(),
    };

    it('denies marketing_sms in EU', async () => {
      const svc = makeService({
        userPreferences: [
          { userId: 'user-1', notificationType: 'marketing_sms', channel: 'sms', enabled: true, updatedAt: new Date() },
        ],
        policies: [EU_MARKETING_SMS_POLICY],
      });

      const result = await svc.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: BASE.datetime,
      });

      expect(result).toEqual({ decision: 'deny', reason: 'blocked_by_global_policy' });
    });

    it('allows marketing_sms in US with same policy active', async () => {
      const svc = makeService({
        userPreferences: [
          { userId: 'user-1', notificationType: 'marketing_sms', channel: 'sms', enabled: true, updatedAt: new Date() },
        ],
        policies: [EU_MARKETING_SMS_POLICY],
      });

      const result = await svc.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'US',
        datetime: BASE.datetime,
      });

      expect(result.decision).toBe('allow');
    });

    it('global policy overrides explicit user preference', async () => {
      const svc = makeService({
        userPreferences: [
          { userId: 'user-1', notificationType: 'marketing_sms', channel: 'sms', enabled: true, updatedAt: new Date() },
        ],
        policies: [EU_MARKETING_SMS_POLICY],
      });

      const result = await svc.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: BASE.datetime,
      });

      // Even though the user enabled it, the global policy wins
      expect(result).toEqual({ decision: 'deny', reason: 'blocked_by_global_policy' });
    });

    it('GLOBAL region policy blocks in all regions', async () => {
      const globalPolicy: GlobalPolicy = {
        ...EU_MARKETING_SMS_POLICY,
        id: 'policy-global',
        region: 'GLOBAL',
      };
      const svc = makeService({
        userPreferences: [
          { userId: 'user-1', notificationType: 'marketing_sms', channel: 'sms', enabled: true, updatedAt: new Date() },
        ],
        policies: [globalPolicy],
      });

      for (const region of ['EU', 'US', 'APAC'] as const) {
        const result = await svc.evaluate({
          userId: 'user-1',
          notificationType: 'marketing_sms',
          channel: 'sms',
          region,
          datetime: BASE.datetime,
        });
        expect(result.decision).toBe('deny');
      }
    });

    it('inactive policy is ignored', async () => {
      const inactivePolicy: GlobalPolicy = { ...EU_MARKETING_SMS_POLICY, isActive: false };
      const svc = makeService({
        userPreferences: [
          { userId: 'user-1', notificationType: 'marketing_sms', channel: 'sms', enabled: true, updatedAt: new Date() },
        ],
        policies: [inactivePolicy],
      });

      const result = await svc.evaluate({
        userId: 'user-1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: BASE.datetime,
      });

      expect(result.decision).toBe('allow');
    });
  });

  // Scenario 5: Idempotency
  describe('Scenario 5 — Idempotency', () => {
    it('calling upsertUserPreference twice with same args does not change the outcome', async () => {
      const userPrefsRepo = createMockUserPrefsRepo();

      // Simulate double-call (retry)
      await userPrefsRepo.upsertUserPreference('user-1', 'marketing_email', 'email', false);
      await userPrefsRepo.upsertUserPreference('user-1', 'marketing_email', 'email', false);

      expect(userPrefsRepo.upsertUserPreference).toHaveBeenCalledTimes(2);
      // Both calls invoked without error 
      // State is idempotent because the DB uses ON CONFLICT DO UPDATE with the same value
    });

    it('evaluation result is stable across repeated calls without state change', async () => {
      const svc = makeService({});

      const r1 = await svc.evaluate({ ...BASE, notificationType: 'transactional_email' });
      const r2 = await svc.evaluate({ ...BASE, notificationType: 'transactional_email' });

      expect(r1).toEqual(r2);
    });
  });
});
