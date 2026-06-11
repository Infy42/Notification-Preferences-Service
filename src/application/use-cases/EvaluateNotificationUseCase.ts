import type { EvaluationService } from '../EvaluationService';
import type { EvaluationRequest, EvaluationResult } from '../../domain/entities';
import { logger } from '../../infrastructure/logger';

export class EvaluateNotificationUseCase {
  constructor(private readonly evaluationService: EvaluationService) {}

  async execute(request: EvaluationRequest): Promise<EvaluationResult> {
    const result = await this.evaluationService.evaluate(request);

    // Structured log (dashboards and alerting)
    logger.info('notification.evaluation', {
      userId: request.userId,
      notificationType: request.notificationType,
      channel: request.channel,
      region: request.region,
      datetime: request.datetime.toISOString(),
      decision: result.decision,
      reason: result.reason,
    });

    return result;
  }
}
