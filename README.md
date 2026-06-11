# Notification Preferences Service

A TypeScript/Node.js microservice that acts as the **single source of truth** for notification preferences across a multi-channel platform (email, SMS, push). Given a user, a notification type, a channel, a region, and a point in time, the service returns a deterministic `allow / deny` decision together with a machine-readable reason.

---

## Table of contents

1. [Quick start (Docker)](#quick-start-docker)
2. [Quick start (local)](#quick-start-local)
3. [Running the tests](#running-the-tests)
4. [API reference](#api-reference)
5. [Architecture](#architecture)
6. [Key design decisions](#key-design-decisions)
7. [What I would add next](#what-i-would-add-next)

---

## Quick start (Docker)

> Requires Docker ≥ 24 and Docker Compose v2.

```bash
# 1. Clone and enter the repo
git clone <your-repo-url>
cd notification-preferences-service

# 2. Start Postgres + the app (migrations run automatically on startup)
docker compose up --build

# The service is now available on http://localhost:3000
curl http://localhost:3000/health
```

---

## Quick start (local)

> Requires Node.js ≥ 20 and a running PostgreSQL 14+ instance.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL

# 3. Run migrations
npm run migrate

# 4. Start in dev mode (ts-node-dev, auto-reload)
npm run dev

# — or build and run compiled output —
npm run build
npm start
```

---

## Running the tests

### Unit tests (no database required)

```bash
npm test
# or to watch:
npm run test:watch
```

24 tests covering all five required scenarios:

| Scenario | Tests |
|---|---|
| Default preferences for new users | 4 |
| User overrides | 3 |
| Quiet hours (including overnight windows) | 4 |
| Global policies | 5 |
| Idempotency | 2 |
| `isInQuietHours` pure helper | 6 |

### Integration tests (requires a test database)

Integration tests hit a real PostgreSQL instance via HTTP (Supertest) and are **skipped automatically** if `TEST_DATABASE_URL` is not set — so `npm test` always works in CI without a database.

```bash
# Start the test DB (port 5433)
docker compose up postgres_test -d

# Set the variable and run all tests
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/notifications_test npm test
```

---

## API reference

### `GET /health`

Liveness probe.

```
200 OK
{ "status": "ok" }
```

---

### `GET /users/:userId/preferences`

Returns the effective preference grid for a user — their explicit overrides merged on top of the platform defaults.

```bash
curl http://localhost:3000/users/user-1/preferences
```

```json
{
  "userId": "user-1",
  "preferences": [
    { "notificationType": "transactional_email", "channel": "email", "enabled": true, "isDefault": true },
    { "notificationType": "marketing_email",     "channel": "email", "enabled": false, "isDefault": true },
    ...
  ],
  "quietHours": null
}
```

`isDefault: true` means the value comes from the platform defaults (no explicit user override stored).

---

### `POST /users/:userId/preferences`

Updates preferences and/or quiet hours. All fields are optional; omitting a field leaves it unchanged.

**Body**

```json
{
  "preferences": [
    { "notificationType": "marketing_email", "channel": "email", "enabled": true }
  ],
  "quietHours": {
    "startTime": "22:00",
    "endTime":   "08:00",
    "timezone":  "Europe/Moscow",
    "marketingOnly": true
  }
}
```

- `quietHours: null` — **deletes** the user's quiet-hours configuration.
- `quietHours` absent — no change to quiet hours.
- Operation is idempotent (PostgreSQL `ON CONFLICT DO UPDATE`).

**Response** — `200 OK`, same shape as `GET`.

---

### `POST /evaluate`

The core check: can this notification be sent right now?

**Body**

```json
{
  "userId": "user-1",
  "notificationType": "marketing_sms",
  "channel": "sms",
  "region": "EU",
  "datetime": "2026-05-21T21:30:00Z"
}
```

| Field | Values |
|---|---|
| `notificationType` | `transactional_email` · `marketing_email` · `transactional_sms` · `marketing_sms` · `transactional_push` · `marketing_push` · `security_email` · `system_push` |
| `channel` | `email` · `sms` · `push` |
| `region` | `EU` · `US` · `APAC` · `LATAM` · `GLOBAL` |
| `datetime` | ISO 8601 with timezone offset |

**Response**

```json
{ "decision": "deny", "reason": "blocked_by_global_policy" }
```

| Reason | Meaning |
|---|---|
| `all_checks_passed` | `allow` |
| `blocked_by_global_policy` | A global policy denies this type/channel/region combination |
| `disabled_by_user` | The user explicitly turned this notification off |
| `disabled_by_default` | No user override — the platform default is `enabled: false` |
| `quiet_hours` | Within the user's quiet-hours window |

---

### `GET /admin/policies`

Lists all global policies.

---

### `POST /admin/policies`

Creates a global policy (admin use; useful for testing).

```json
{
  "notificationType": "marketing_sms",
  "channel": "sms",
  "region": "EU",
  "action": "deny"
}
```

`notificationType` and `channel` accept `null` as a wildcard (matches all types / all channels).

---

## Architecture

```
notification-preferences-service/
├── src/
│   ├── domain/                  # Pure types and interfaces — zero I/O
│   │   ├── types.ts             # NotificationType, Channel, Region, DENY_REASONS
│   │   ├── entities.ts          # UserPreference, QuietHoursConfig, GlobalPolicy, …
│   │   └── repositories/        # IUserPreferencesRepository, IGlobalPoliciesRepository
│   │
│   ├── application/             # Business logic — depends only on domain interfaces
│   │   ├── EvaluationService.ts # Core evaluation pipeline (pure, no HTTP/DB)
│   │   └── use-cases/           # GetUserPreferences, UpdateUserPreferences, EvaluateNotification
│   │
│   └── infrastructure/          # Adapters — implements domain interfaces
│       ├── database/
│       │   ├── pool.ts
│       │   ├── migrate.ts
│       │   ├── migrations/001_initial.sql
│       │   └── repositories/    # PgUserPreferencesRepository, PgGlobalPoliciesRepository
│       ├── http/
│       │   ├── handlers/        # preferencesHandler, evaluateHandler, policiesHandler
│       │   ├── middleware/      # errorHandler (Zod → 400, AppError → custom, else → 500)
│       │   └── router.ts
│       └── logger.ts            # Winston (JSON in prod, colorized in dev)
│
└── tests/
    ├── unit/                    # Mock-based, instant, no DB
    └── integration/             # Full HTTP → real PostgreSQL round-trips
```

The architecture follows the **Hexagonal / Ports & Adapters** pattern:

- **Domain** knows nothing about Express, PostgreSQL, or Winston.
- **Application** depends only on repository _interfaces_ (ports).
- **Infrastructure** provides the concrete adapters (PostgreSQL repos, HTTP handlers).

This means business logic is trivially unit-testable with plain in-memory mocks — no test containers, no `pg` imports, no network.

---

## Key design decisions

### Evaluation priority

The pipeline stops at the **first denial**, evaluated from highest to lowest precedence:

```
1. Global policies  →  blocked_by_global_policy  (platform overrides everything)
2. User preferences →  disabled_by_user
3. Default prefs    →  disabled_by_default
4. Quiet hours      →  quiet_hours
```

Global policies are checked first so that compliance/legal rules always win, even if a user has explicitly enabled a type.

### `notificationType` encodes category + channel

`marketing_email`, `transactional_sms`, etc. — the pair of category and channel is the natural unit of user preference ("I want marketing emails off"). This avoids an extra join and keeps the preference table flat. A separate `channel` column in the evaluation request allows channel-level filtering at the global-policy level.

### Quiet hours

- Default `marketingOnly: true` — transactional and security notifications always go through regardless of the window.
- Handles overnight windows (e.g. 22:00–08:00) and same-timezone edge cases via a pure helper function `isInQuietHours` that converts UTC datetimes to the user's IANA timezone with Luxon.

### Idempotency

`ON CONFLICT DO UPDATE` in PostgreSQL — no application-level dedup needed. Sending the same preference update twice leaves the database in exactly the same state.

### Integration tests are opt-in

`TEST_DATABASE_URL` absent → integration suite is skipped. Unit tests always run. This avoids breaking CI pipelines that don't provision a database.

---

## What I would add next

### Reliability & scalability
- **Caching** — preference lookups are read-heavy. A Redis layer (invalidated on `POST /users/:id/preferences`) would cut latency and DB load significantly.
- **Database connection pooling tuning** — expose `pool.max`, `idleTimeoutMillis`, and `connectionTimeoutMillis` as env variables; add a `/metrics` endpoint exposing pool stats.
- **Pagination** for `GET /admin/policies` (cursor-based).

### Observability
- **Structured metrics** — Prometheus counters (`evaluate_total{decision,reason}`, `preferences_update_total`) and histograms (`evaluate_duration_seconds`). The use-case layer is the ideal injection point — no domain or HTTP concerns.
- **Distributed tracing** — propagate `traceparent` headers; attach trace/span IDs to Winston log lines.
- **Alerting** — alert on anomalous deny-rate spikes (`blocked_by_global_policy` > threshold) which may signal a misconfigured policy rollout.

### Operations
- **Soft-delete / audit log** for global policies — regulatory environments require knowing _who_ created a policy and _when_ it was removed.
- **Policy conflict detection** — warn on overlapping wildcard + specific policies at creation time.
- **Admin auth middleware** — the `/admin/*` routes need authentication (e.g. JWT with a `role: admin` claim) before going to production.
- **Zero-downtime migrations** — add a migration lock table and integrate with a deployment pipeline.
- **Kubernetes manifests / Helm chart** — `Deployment`, `Service`, `HorizontalPodAutoscaler`, `PodDisruptionBudget`, liveness/readiness probes wired to `/health`.
