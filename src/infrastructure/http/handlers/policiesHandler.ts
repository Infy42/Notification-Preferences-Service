import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IGlobalPoliciesRepository } from '../../../domain/repositories/IGlobalPoliciesRepository';
import { NOTIFICATION_TYPES, CHANNELS, REGIONS } from '../../../domain/types';

const CreatePolicySchema = z.object({
  notificationType: z.enum(NOTIFICATION_TYPES).nullable().optional(),
  channel: z.enum(CHANNELS).nullable().optional(),
  region: z.enum(REGIONS),
  reason: z.string().min(1),
  isActive: z.boolean().optional().default(true),
});

export class PoliciesHandler {
  constructor(private readonly globalPoliciesRepo: IGlobalPoliciesRepository) {}

  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const policies = await this.globalPoliciesRepo.getAllPolicies();
      res.json({ policies });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = CreatePolicySchema.parse(req.body);
      const policy = await this.globalPoliciesRepo.createPolicy({
        notificationType: body.notificationType ?? null,
        channel: body.channel ?? null,
        region: body.region,
        action: 'deny',
        reason: body.reason,
        isActive: body.isActive,
      });
      res.status(201).json(policy);
    } catch (err) {
      next(err);
    }
  }
}
