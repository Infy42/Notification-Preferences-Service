import { v4 as uuidv4 } from 'uuid';
import type { Pool } from 'pg';
import type { IGlobalPoliciesRepository } from '../../../domain/repositories/IGlobalPoliciesRepository';
import type { GlobalPolicy } from '../../../domain/entities';
import type { NotificationType, Channel, Region } from '../../../domain/types';

type PolicyRow = {
  id: string;
  notification_type: string | null;
  channel: string | null;
  region: string;
  action: string;
  reason: string;
  is_active: boolean;
  created_at: Date;
};

function mapRow(r: PolicyRow): GlobalPolicy {
  return {
    id: r.id,
    notificationType: r.notification_type as NotificationType | null,
    channel: r.channel as Channel | null,
    region: r.region as Region,
    action: r.action as 'deny',
    reason: r.reason,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

export class PgGlobalPoliciesRepository implements IGlobalPoliciesRepository {
  constructor(private readonly pool: Pool) {}

  async findMatchingPolicies(
    notificationType: NotificationType,
    channel: Channel,
    region: Region,
  ): Promise<GlobalPolicy[]> {
    const { rows } = await this.pool.query<PolicyRow>(
      `SELECT id, notification_type, channel, region, action, reason, is_active, created_at
       FROM global_policies
       WHERE is_active = true
         AND (notification_type IS NULL OR notification_type = $1)
         AND (channel IS NULL OR channel = $2)
         AND (region = $3 OR region = 'GLOBAL')`,
      [notificationType, channel, region],
    );
    return rows.map(mapRow);
  }

  async getAllPolicies(): Promise<GlobalPolicy[]> {
    const { rows } = await this.pool.query<PolicyRow>(
      `SELECT id, notification_type, channel, region, action, reason, is_active, created_at
       FROM global_policies
       ORDER BY created_at DESC`,
    );
    return rows.map(mapRow);
  }

  async createPolicy(policy: Omit<GlobalPolicy, 'id' | 'createdAt'>): Promise<GlobalPolicy> {
    const { rows } = await this.pool.query<PolicyRow>(
      `INSERT INTO global_policies
         (id, notification_type, channel, region, action, reason, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        uuidv4(),
        policy.notificationType,
        policy.channel,
        policy.region,
        policy.action,
        policy.reason,
        policy.isActive,
      ],
    );
    return mapRow(rows[0]);
  }
}
