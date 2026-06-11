import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import type { GetUserPreferencesUseCase } from '../../../application/use-cases/GetUserPreferencesUseCase';
import type { UpdateUserPreferencesUseCase } from '../../../application/use-cases/UpdateUserPreferencesUseCase';
import { NOTIFICATION_TYPES, CHANNELS } from '../../../domain/types';
import { logger } from '../../logger';

// Validation schema

const UpdatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        notificationType: z.enum(NOTIFICATION_TYPES),
        channel: z.enum(CHANNELS),
        enabled: z.boolean(),
      }),
    )
    .optional(),
  quietHours: z
    .union([
      z.object({
        startTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, 'Must be in HH:MM format')
          .refine(t => {
            const [h, m] = t.split(':').map(Number);
            return h >= 0 && h <= 23 && m >= 0 && m <= 59;
          }, 'Invalid time value'),
        endTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, 'Must be in HH:MM format')
          .refine(t => {
            const [h, m] = t.split(':').map(Number);
            return h >= 0 && h <= 23 && m >= 0 && m <= 59;
          }, 'Invalid time value'),
        timezone: z
          .string()
          .min(1)
          .refine(
            tz => DateTime.now().setZone(tz).isValid,
            'Invalid IANA timezone',
          ),
        marketingOnly: z.boolean().optional().default(true),
      }),
      z.null(),
    ])
    .optional(),
});

// Handler

export class PreferencesHandler {
  constructor(
    private readonly getUseCase: GetUserPreferencesUseCase,
    private readonly updateUseCase: UpdateUserPreferencesUseCase,
  ) {}

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const result = await this.getUseCase.execute(userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const body = UpdatePreferencesSchema.parse(req.body);

      const result = await this.updateUseCase.execute({
        userId,
        preferences: body.preferences,
        quietHours: body.quietHours,
      });

      logger.info('preferences.updated', { userId });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
