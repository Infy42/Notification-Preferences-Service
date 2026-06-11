import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { EvaluateNotificationUseCase } from '../../../application/use-cases/EvaluateNotificationUseCase';
import { NOTIFICATION_TYPES, CHANNELS, REGIONS } from '../../../domain/types';

const EvaluateSchema = z.object({
  userId: z.string().min(1),
  notificationType: z.enum(NOTIFICATION_TYPES),
  channel: z.enum(CHANNELS),
  region: z.enum(REGIONS),
  datetime: z.string().datetime({ message: 'Must be a valid ISO-8601 datetime with timezone' }),
});

export class EvaluateHandler {
  constructor(private readonly evaluateUseCase: EvaluateNotificationUseCase) {}

  async evaluate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = EvaluateSchema.parse(req.body);

      const result = await this.evaluateUseCase.execute({
        userId: body.userId,
        notificationType: body.notificationType,
        channel: body.channel,
        region: body.region,
        datetime: new Date(body.datetime),
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
