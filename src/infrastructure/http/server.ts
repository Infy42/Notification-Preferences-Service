import express, { type Application } from 'express';
import type { Pool } from 'pg';
import { createRouter } from './router';
import { errorHandler } from './middleware/errorHandler';

export function createApp(pool: Pool): Application {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/', createRouter(pool));
  app.use(errorHandler);

  return app;
}
