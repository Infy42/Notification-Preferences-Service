import { pool } from './infrastructure/database/pool';
import { runMigrations } from './infrastructure/database/migrate';
import { createApp } from './infrastructure/http/server';
import { config } from './config';
import { logger } from './infrastructure/logger';

async function main(): Promise<void> {
  logger.info('Starting Notification Preferences Service', { env: config.nodeEnv });

  await runMigrations(pool);
  logger.info('Database migrations up to date');

  const app = createApp(pool);

  app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`);
  });
}

main().catch(err => {
  logger.error('Fatal error during startup', { error: err });
  process.exit(1);
});
