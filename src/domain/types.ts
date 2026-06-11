// Notification Types
// Combines category (transactional/marketing/security/system) with channel,
// which is the natural unit of user preference ("I want marketing emails off")

export const NOTIFICATION_TYPES = [
  'transactional_email',
  'marketing_email',
  'transactional_sms',
  'marketing_sms',
  'transactional_push',
  'marketing_push',
  'security_email',
  'system_push',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Channels

export const CHANNELS = ['email', 'sms', 'push'] as const;
export type Channel = (typeof CHANNELS)[number];

// Regions

export const REGIONS = ['EU', 'US', 'APAC', 'LATAM', 'GLOBAL'] as const;
export type Region = (typeof REGIONS)[number];

// Evaluation decision

export type Decision = 'allow' | 'deny';

export const DENY_REASONS = {
  BLOCKED_BY_GLOBAL_POLICY: 'blocked_by_global_policy',
  DISABLED_BY_USER: 'disabled_by_user',
  DISABLED_BY_DEFAULT: 'disabled_by_default',
  QUIET_HOURS: 'quiet_hours',
  ALLOW: 'all_checks_passed',
} as const;

// Type guards

export function isMarketingType(notificationType: NotificationType): boolean {
  return notificationType.startsWith('marketing_');
}

export function isValidNotificationType(v: string): v is NotificationType {
  return NOTIFICATION_TYPES.includes(v as NotificationType);
}

export function isValidChannel(v: string): v is Channel {
  return CHANNELS.includes(v as Channel);
}

export function isValidRegion(v: string): v is Region {
  return REGIONS.includes(v as Region);
}
