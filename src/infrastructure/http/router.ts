import { Router } from 'express';
import type { Pool } from 'pg';
import { PgUserPreferencesRepository } from '../database/repositories/PgUserPreferencesRepository';
import { PgGlobalPoliciesRepository } from '../database/repositories/PgGlobalPoliciesRepository';
import { EvaluationService } from '../../application/EvaluationService';
import { GetUserPreferencesUseCase } from '../../application/use-cases/GetUserPreferencesUseCase';
import { UpdateUserPreferencesUseCase } from '../../application/use-cases/UpdateUserPreferencesUseCase';
import { EvaluateNotificationUseCase } from '../../application/use-cases/EvaluateNotificationUseCase';
import { PreferencesHandler } from './handlers/preferencesHandler';
import { EvaluateHandler } from './handlers/evaluateHandler';
import { PoliciesHandler } from './handlers/policiesHandler';

export function createRouter(pool: Pool): Router {
  const router = Router();

  // Repositories
  const userPrefsRepo = new PgUserPreferencesRepository(pool);
  const globalPoliciesRepo = new PgGlobalPoliciesRepository(pool);

  // Services
  const evaluationService = new EvaluationService(userPrefsRepo, globalPoliciesRepo);

  // Use cases
  const getPrefsUC = new GetUserPreferencesUseCase(userPrefsRepo);
  const updatePrefsUC = new UpdateUserPreferencesUseCase(userPrefsRepo);
  const evaluateUC = new EvaluateNotificationUseCase(evaluationService);

  // Handlers
  const prefsHandler = new PreferencesHandler(getPrefsUC, updatePrefsUC);
  const evaluateHandler = new EvaluateHandler(evaluateUC);
  const policiesHandler = new PoliciesHandler(globalPoliciesRepo);

  // Routes

  // User preferences
  router.get('/users/:userId/preferences', (req, res, next) =>
    prefsHandler.get(req, res, next),
  );
  router.post('/users/:userId/preferences', (req, res, next) =>
    prefsHandler.update(req, res, next),
  );

  // Notification delivery check
  router.post('/evaluate', (req, res, next) =>
    evaluateHandler.evaluate(req, res, next),
  );

  // Admin — global policy management
  router.get('/admin/policies', (req, res, next) =>
    policiesHandler.list(req, res, next),
  );
  router.post('/admin/policies', (req, res, next) =>
    policiesHandler.create(req, res, next),
  );

  return router;
}
