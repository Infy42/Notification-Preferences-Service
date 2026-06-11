/**
 * Integration tests for the full HTTP API
 *
 * Requires a running PostgreSQL instance.
 * Set TEST_DATABASE_URL (or DATABASE_URL) before running:
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/notification_prefs_test \
 *     npm run test:integration
 *
 * With docker-compose: `docker-compose up -d postgres_test` then run tests
 */

import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../../src/infrastructure/http/server';
import { runMigrations } from '../../src/infrastructure/database/migrate';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/notification_prefs_test';

const skip = !process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const maybe = skip ? describe.skip : describe;

maybe('API Integration Tests', () => {
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    await runMigrations(pool);
    app = createApp(pool);
  });

  afterEach(async () => {
    // clean up, keep defaults
    await pool.query('DELETE FROM user_preferences');
    await pool.query('DELETE FROM user_quiet_hours');
    await pool.query('DELETE FROM global_policies');
  });

  afterAll(async () => {
    await pool.end();
  });

  // Health check
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  // Scenario 1: Default preferences for new users
  describe('GET /users/:userId/preferences', () => {
    it('returns default preferences for a brand-new user', async () => {
      const res = await request(app).get('/users/new-user-xyz/preferences');
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('new-user-xyz');
      expect(res.body.quietHours).toBeNull();

      const prefs: Array<{ notificationType: string; enabled: boolean; source: string }> =
        res.body.preferences;

      const txEmail = prefs.find(p => p.notificationType === 'transactional_email');
      const mktEmail = prefs.find(p => p.notificationType === 'marketing_email');

      expect(txEmail).toMatchObject({ enabled: true, source: 'default' });
      expect(mktEmail).toMatchObject({ enabled: false, source: 'default' });
    });
  });

  // Scenario 2: User changes preferences
  describe('POST /users/:userId/preferences', () => {
    it('user enables marketing_email; other prefs stay at default', async () => {
      const res = await request(app)
        .post('/users/user-a/preferences')
        .send({ preferences: [{ notificationType: 'marketing_email', channel: 'email', enabled: true }] });

      expect(res.status).toBe(200);

      const mktEmail = res.body.preferences.find(
        (p: { notificationType: string }) => p.notificationType === 'marketing_email',
      );
      const txEmail = res.body.preferences.find(
        (p: { notificationType: string }) => p.notificationType === 'transactional_email',
      );

      expect(mktEmail).toMatchObject({ enabled: true, source: 'user' });
      // Transactional email was not changed (still default)
      expect(txEmail).toMatchObject({ enabled: true, source: 'default' });
    });

    it('user disables transactional_email; marketing_email stays disabled (default)', async () => {
      const res = await request(app)
        .post('/users/user-b/preferences')
        .send({ preferences: [{ notificationType: 'transactional_email', channel: 'email', enabled: false }] });

      const txEmail = res.body.preferences.find(
        (p: { notificationType: string }) => p.notificationType === 'transactional_email',
      );
      const mktEmail = res.body.preferences.find(
        (p: { notificationType: string }) => p.notificationType === 'marketing_email',
      );

      expect(txEmail).toMatchObject({ enabled: false, source: 'user' });
      expect(mktEmail).toMatchObject({ enabled: false, source: 'default' });
    });
  });

  // Scenario 3: Quiet hours
  describe('Quiet hours', () => {
    it('sets quiet hours and reflects them in GET preferences', async () => {
      const updateRes = await request(app)
        .post('/users/user-c/preferences')
        .send({
          quietHours: { startTime: '22:00', endTime: '08:00', timezone: 'Europe/Moscow' },
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.quietHours).toMatchObject({
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'Europe/Moscow',
        marketingOnly: true,
      });

      const getRes = await request(app).get('/users/user-c/preferences');
      expect(getRes.body.quietHours).toMatchObject({ startTime: '22:00', endTime: '08:00' });
    });

    it('removes quiet hours when set to null', async () => {
      await request(app)
        .post('/users/user-d/preferences')
        .send({ quietHours: { startTime: '22:00', endTime: '08:00', timezone: 'UTC' } });

      const removeRes = await request(app)
        .post('/users/user-d/preferences')
        .send({ quietHours: null });

      expect(removeRes.body.quietHours).toBeNull();
    });
  });

  // Evaluate endpoint
  describe('POST /evaluate', () => {
    it('allows transactional_email by default', async () => {
      const res = await request(app).post('/evaluate').send({
        userId: 'eval-user-1',
        notificationType: 'transactional_email',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ decision: 'allow' });
    });

    it('denies marketing_email by default', async () => {
      const res = await request(app).post('/evaluate').send({
        userId: 'eval-user-1',
        notificationType: 'marketing_email',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(res.body).toMatchObject({ decision: 'deny', reason: 'disabled_by_default' });
    });

    it('allows marketing_email after user explicitly enables it', async () => {
      await request(app)
        .post('/users/eval-user-2/preferences')
        .send({ preferences: [{ notificationType: 'marketing_email', channel: 'email', enabled: true }] });

      const res = await request(app).post('/evaluate').send({
        userId: 'eval-user-2',
        notificationType: 'marketing_email',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(res.body).toMatchObject({ decision: 'allow' });
    });

    it('denies marketing_push during quiet hours; allows transactional_push', async () => {
      await request(app)
        .post('/users/eval-user-3/preferences')
        .send({
          preferences: [{ notificationType: 'marketing_push', channel: 'push', enabled: true }],
          quietHours: { startTime: '22:00', endTime: '08:00', timezone: 'Europe/Moscow' },
        });

      // 19:30 UTC = 22:30 Moscow - inside quiet hours
      const mktRes = await request(app).post('/evaluate').send({
        userId: 'eval-user-3',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'US',
        datetime: '2026-05-21T19:30:00Z',
      });
      expect(mktRes.body).toMatchObject({ decision: 'deny', reason: 'quiet_hours' });

      // Transactional push passes (marketingOnly = true by default)
      const txRes = await request(app).post('/evaluate').send({
        userId: 'eval-user-3',
        notificationType: 'transactional_push',
        channel: 'push',
        region: 'US',
        datetime: '2026-05-21T19:30:00Z',
      });
      expect(txRes.body).toMatchObject({ decision: 'allow' });
    });

    it('global policy blocks marketing_sms in EU regardless of user preference', async () => {
      await request(app).post('/admin/policies').send({
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        reason: 'EU GDPR marketing restriction',
      });

      // Even if user enabled it
      await request(app)
        .post('/users/eval-user-4/preferences')
        .send({ preferences: [{ notificationType: 'marketing_sms', channel: 'sms', enabled: true }] });

      const res = await request(app).post('/evaluate').send({
        userId: 'eval-user-4',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(res.body).toMatchObject({ decision: 'deny', reason: 'blocked_by_global_policy' });
    });

    it('same EU policy does NOT block marketing_sms in US', async () => {
      await request(app).post('/admin/policies').send({
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        reason: 'EU GDPR marketing restriction',
      });

      await request(app)
        .post('/users/eval-user-5/preferences')
        .send({ preferences: [{ notificationType: 'marketing_sms', channel: 'sms', enabled: true }] });

      const res = await request(app).post('/evaluate').send({
        userId: 'eval-user-5',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'US',
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(res.body).toMatchObject({ decision: 'allow' });
    });
  });

  // Scenario 5: Idempotency
  describe('Idempotency', () => {
    it('disabling marketing_email twice yields the same result as once', async () => {
      const payload = {
        preferences: [{ notificationType: 'marketing_email', channel: 'email', enabled: false }],
      };

      await request(app).post('/users/idem-user/preferences').send(payload);
      const res2 = await request(app).post('/users/idem-user/preferences').send(payload);

      expect(res2.status).toBe(200);
      const pref = res2.body.preferences.find(
        (p: { notificationType: string }) => p.notificationType === 'marketing_email',
      );
      expect(pref).toMatchObject({ enabled: false, source: 'user' });
    });

    it('setting quiet hours twice keeps last written value', async () => {
      await request(app)
        .post('/users/idem-user-2/preferences')
        .send({ quietHours: { startTime: '22:00', endTime: '08:00', timezone: 'UTC' } });
      const res2 = await request(app)
        .post('/users/idem-user-2/preferences')
        .send({ quietHours: { startTime: '22:00', endTime: '08:00', timezone: 'UTC' } });

      expect(res2.status).toBe(200);
      expect(res2.body.quietHours).toMatchObject({ startTime: '22:00', endTime: '08:00' });
    });
  });

  // Validation
  describe('Input validation', () => {
    it('returns 400 for invalid notificationType', async () => {
      const res = await request(app).post('/evaluate').send({
        userId: 'u1',
        notificationType: 'bad_type',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T12:00:00Z',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid datetime', async () => {
      const res = await request(app).post('/evaluate').send({
        userId: 'u1',
        notificationType: 'marketing_email',
        channel: 'email',
        region: 'US',
        datetime: 'not-a-date',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid quiet hours timezone', async () => {
      const res = await request(app)
        .post('/users/u1/preferences')
        .send({ quietHours: { startTime: '22:00', endTime: '08:00', timezone: 'Not/Valid' } });
      expect(res.status).toBe(400);
    });
  });
});

// Inform when integration tests are skipped
if (skip) {
  it('Integration tests skipped — set TEST_DATABASE_URL to run them', () => {
    console.log('ℹ  Set TEST_DATABASE_URL to run integration tests');
  });
}
