import type { IUserPreferencesRepository } from '../../src/domain/repositories/IUserPreferencesRepository';
import type { IGlobalPoliciesRepository } from '../../src/domain/repositories/IGlobalPoliciesRepository';
import type {
  UserPreference,
  QuietHoursConfig,
  DefaultPreference,
  GlobalPolicy,
} from '../../src/domain/entities';

// Seed defaults matching the SQL migration
export const DEFAULT_PREFERENCES: DefaultPreference[] = [
  { notificationType: 'transactional_email', channel: 'email', enabled: true },
  { notificationType: 'marketing_email', channel: 'email', enabled: false },
  { notificationType: 'transactional_sms', channel: 'sms', enabled: true },
  { notificationType: 'marketing_sms', channel: 'sms', enabled: false },
  { notificationType: 'transactional_push', channel: 'push', enabled: true },
  { notificationType: 'marketing_push', channel: 'push', enabled: false },
  { notificationType: 'security_email', channel: 'email', enabled: true },
  { notificationType: 'system_push', channel: 'push', enabled: true },
];

// Mock factories

export interface MockUserPrefsOverrides {
  userPreferences?: UserPreference[];
  quietHours?: QuietHoursConfig | null;
  defaults?: DefaultPreference[];
}

export function createMockUserPrefsRepo(
  overrides: MockUserPrefsOverrides = {},
): jest.Mocked<IUserPreferencesRepository> {
  const userPreferences = overrides.userPreferences ?? [];
  const quietHours = overrides.quietHours ?? null;
  const defaults = overrides.defaults ?? DEFAULT_PREFERENCES;

  return {
    getUserPreferences: jest.fn().mockResolvedValue(userPreferences),
    upsertUserPreference: jest
      .fn()
      .mockImplementation(async (userId, notificationType, channel, enabled) => ({
        userId,
        notificationType,
        channel,
        enabled,
        updatedAt: new Date(),
      })),
    getDefaultPreferences: jest.fn().mockResolvedValue(defaults),
    getQuietHours: jest.fn().mockResolvedValue(quietHours),
    upsertQuietHours: jest.fn().mockImplementation(async config => ({
      ...config,
      updatedAt: new Date(),
    })),
    deleteQuietHours: jest.fn().mockResolvedValue(undefined),
  };
}

export function createMockGlobalPoliciesRepo(
  policies: GlobalPolicy[] = [],
): jest.Mocked<IGlobalPoliciesRepository> {
  return {
    findMatchingPolicies: jest
      .fn()
      .mockImplementation(async (notificationType, channel, region) =>
        policies.filter(
          p =>
            p.isActive &&
            (p.notificationType === null || p.notificationType === notificationType) &&
            (p.channel === null || p.channel === channel) &&
            (p.region === region || p.region === 'GLOBAL'),
        ),
      ),
    getAllPolicies: jest.fn().mockResolvedValue(policies),
    createPolicy: jest.fn().mockImplementation(async policy => ({
      ...policy,
      id: 'test-id',
      createdAt: new Date(),
    })),
  };
}

// Shared fixtures

export const OVERNIGHT_QUIET_HOURS: QuietHoursConfig = {
  userId: 'user-1',
  startTime: '22:00',
  endTime: '08:00',
  timezone: 'Europe/Moscow', // UTC+3
  marketingOnly: true,
  updatedAt: new Date(),
};

/** 22:30 Moscow = 19:30 UTC - inside quiet hours */
export const DATETIME_INSIDE_QUIET_HOURS = new Date('2026-05-21T19:30:00Z');

/** 12:00 Moscow = 09:00 UTC - outside quiet hours */
export const DATETIME_OUTSIDE_QUIET_HOURS = new Date('2026-05-21T09:00:00Z');
