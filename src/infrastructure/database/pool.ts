import { Pool } from 'pg';
import { config } from '../../config';

// Singleton pool for the application
export const pool = new Pool({
  connectionString: config.databaseUrl,
  // Reasonable defaults (tune for prod based on load)
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});
