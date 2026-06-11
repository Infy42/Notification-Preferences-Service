import type { GlobalPolicy } from '../entities';
import type { NotificationType, Channel, Region } from '../types';

export interface IGlobalPoliciesRepository {
  /**
   * Returns all active policies that match the given (type, channel, region) triple
   * A policy with null notificationType or null channel matches any value
   * A policy with region = 'GLOBAL' matches any region
   */
  findMatchingPolicies(
    notificationType: NotificationType,
    channel: Channel,
    region: Region,
  ): Promise<GlobalPolicy[]>;

  /** All policies (active and inactive), for admin/display purposes. */
  getAllPolicies(): Promise<GlobalPolicy[]>;

  createPolicy(policy: Omit<GlobalPolicy, 'id' | 'createdAt'>): Promise<GlobalPolicy>;
}
