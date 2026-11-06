# Operations

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production | PostgreSQL connection string. |
| `HANSAN_DB_DRIVER` | Production | `postgres` or `pglite`. |
| `HANSAN_PGLITE_DIR` | PGlite only | Durable directory, e.g. `.data/pglite`. |
| `HANSAN_AUTO_MIGRATE` | No | `true` runs migrations at startup. Defaults on outside production. |
| `HANSAN_DEMO_MODE` | No | Explicitly opts into demo data. Defaults off and is always disabled in production. |
| `HANSAN_DEMO_PASSWORD` | Demo only | Local-only password (12+ characters) used for all seeded demo accounts. Never commit it. |
| `NEXT_PUBLIC_APP_URL` | No | Canonical public URL used by integrations. |
| `NEXT_PUBLIC_ENABLE_SW` | No | Opt into the service worker in development. Production enables it automatically. |

Secrets belong in the platform secret store, not in committed files.

## Local development

```powershell
Copy-Item .env.example .env.local
# Edit .env.local:
#   HANSAN_DEMO_MODE=true
#   HANSAN_DEMO_PASSWORD=<unique local-only value, 12+ characters>
npm install
npm run dev
```

Default: PGlite at `.data/pglite` and automatic migration. Demo data is seeded
only when `HANSAN_DEMO_MODE=true` and `HANSAN_DEMO_PASSWORD` is set in the local
environment. Delete `.data/` only when you intentionally want to reset local
data. Demo seeding is refused when `NODE_ENV=production`.

## Production topology

Minimum viable topology:

```
HTTPS reverse proxy
       │
Next.js app (one or more instances)
       │
Managed PostgreSQL (primary + backups)
```

The service worker and POS queue are client-side. No application state is kept in
the Node process except the in-memory rate limiter, so multiple app instances are
safe except for the rate-limit caveat below.

## Migrations

Generate after schema edits:

```bash
npm run db:generate
```

Apply in development:

```bash
npm run db:migrate
```

Apply in a runtime image or release job:

```bash
node scripts/migrate.mjs
# or
npm run db:migrate:prod
```

The runner supports PostgreSQL (`DATABASE_URL`) and PGlite. Run migrations once,
before rolling out application instances. For multiple replicas, use a single
release job rather than letting every replica race the migrator.

The included Compose service runs the migration runner in the app container
before `next start`. It is intended for a single app replica.

## Docker Compose

Create `.env`:

```dotenv
POSTGRES_PASSWORD=replace-with-a-long-random-value
HANSAN_DEMO_MODE=false
NEXT_PUBLIC_APP_URL=https://hansan.example.com
APP_PORT=3000
```

Then:

```bash
docker compose up --build -d
docker compose logs -f app
```

PostgreSQL data is stored in the `hansan_postgres` volume. Stop without deleting
data: `docker compose down`. Removing the volume is destructive and must be an
explicit decision.

## Health

- `GET /api/health` executes `select 1` and reports the active driver.
- Container health checks call this endpoint.
- Alert on repeated non-200 responses, application 5xx, and database connection
  saturation.

## Backups and recovery

- Use managed PostgreSQL automated backups with point-in-time recovery.
- Test a restore into a separate database at least quarterly.
- The POS terminal queue is device-local. Backing up the server does not recover
  an unsynced browser queue.
- Never clear site data or reinstalling the browser profile while pending sales
  exist. Use the queue view to confirm the server has acknowledged all rows.

## Offline incident runbook

1. Keep the POS online indicator visible. Offline cash sales continue.
2. Do not reload from a different origin, clear storage, or use private browsing.
3. When connectivity returns, the terminal retries every 20 seconds and on the
   `online` event. The operator can also press **Sync**.
4. For each `conflict`, compare the device and server totals, settle the
   difference with the customer, then discard the local record and re-ring.
5. For each `failed` row, read the server error; fix the cause and re-ring or
   follow the operator escalation policy.
6. A session expiry keeps the queue but requires sign-in before sync. The local
   queue is not deleted on logout.

## Scaling notes

- Rate limits are per process. Move login/public-order limiting to Redis or a
  database if running multiple replicas and the limits matter.
- KDS polls. It is not a websocket push channel in this release.
- Public storefront resolution exposes one outlet per tenant.
- PostgreSQL connection pool size is 10 per app process (`src/db/client.ts`).
  Tune against the database's connection limit.
- Static assets and the service worker are served by Next; a CDN can sit in front.

## PGlite single-node mode

PGlite is supported for local development and small single-node self-hosting. It
is a real PostgreSQL engine in process, but it is not a replacement for a managed
database in a multi-replica or high-availability deployment. Production refuses
PGlite unless `HANSAN_PGLITE_DIR` is explicitly set.

Only one app or migration process may use a file-backed PGlite directory at a
time. HANSAN acquires a sidecar lock and fails database initialization with an
actionable error if another process owns that directory; use a different
`HANSAN_PGLITE_DIR` for an isolated instance.

HANSAN never removes a lock automatically, including when its PID is absent.
For manual recovery after a forced termination:

1. Read the adjacent `.hansan.lock` JSON. Confirm `databaseDirectory` resolves to
   the intended PGlite directory; malformed metadata or a path mismatch means
   ownership is uncertain, so do not remove the lock.
2. On Windows, compare `pid` and `processStartedAt` with the process creation
   time and command line:

   ```powershell
   Get-CimInstance Win32_Process -Filter "ProcessId = <pid>" |
     Select-Object ProcessId, CreationDate, ExecutablePath, CommandLine
   ```

   A matching PID alone does not establish ownership because Windows can reuse
   PIDs. A matching PID and start time with a process using the database means
   the lock is active. A different process start time means the PID was reused.
3. Check all running application and migration processes, not only the recorded
   PID, and verify none uses the recorded database directory. If any process,
   start time, or path cannot be verified, treat ownership as uncertain and
   leave the lock in place.
4. Only when the recorded owner is absent or its PID has been reused, the lock
   path matches the intended database, and no process uses that directory may
   the adjacent `.hansan.lock` file be removed manually. Never delete or alter
   database files as part of lock recovery.

## Demo data

`npm run db:seed` creates the demo tenant. It is idempotent and does not run
automatically in production. Do not reuse demo passwords in production.
