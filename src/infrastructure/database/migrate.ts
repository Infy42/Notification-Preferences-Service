import path from 'path';
import fs from 'fs';
import type { Pool, PoolClient } from 'pg';
import { logger } from '../logger';

/**
 * Applies all pending SQL migrations in `./migrations/` in lexicographic order.
 * Each migration runs inside a transaction; failures roll back the single migration.
 * The `schema_migrations` table tracks applied versions so re-running is safe.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await applyMigrations(client);
  } finally {
    client.release();
  }
}

async function applyMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await client.query(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [file],
    );

    if (rows.length > 0) {
      logger.debug(`Migration already applied, skipping`, { version: file });
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    logger.info(`Applying migration`, { version: file });

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info(`Migration applied successfully`, { version: file });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Migration failed, rolling back`, { version: file, error: err });
      throw err;
    }
  }
}

// ─── Standalone entry-point for `npm run migrate` ─────────────────────────────
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../config');
  const pool = new Pool({ connectionString: config.databaseUrl });

  runMigrations(pool)
    .then(async () => {
      logger.info('All migrations applied successfully');
      await pool.end();
    })
    .catch(async (err: unknown) => {
      logger.error('Migration run failed', { error: err });
      await pool.end();
      process.exit(1);
    });
}
