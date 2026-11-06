# Testing

## Commands

```bash
npm run typecheck
npm test
npm run test:postgres
npm run test:e2e
```

`npm test` runs Vitest against isolated PGlite databases with the real Drizzle
migrations; offline queue tests use `fake-indexeddb`. It does not need an
external database or browser. Demo tests generate a per-run password in-process;
no usable demo password is committed.

`npm run typecheck` runs `next typegen` before `tsc --noEmit`. `next-env.d.ts`
is generated and ignored by Git, so a fresh checkout gets the correct Next.js
types without committing generated files.

`npm run test:e2e` runs a Playwright workflow in an isolated temporary project
copy. The harness excludes the workspace `.data`, `.next`, `node_modules`, and
`.env*`, builds with `next build --webpack`, generates a per-run demo password,
seeds a separate temporary PGlite database, and serves the production output on
a separate port. It does not use
the active app server or workspace database/build output. Microsoft Edge is the
default browser channel; `PLAYWRIGHT_BROWSER` can select another installed
Playwright browser channel. The parent runner removes its exact per-run
temporary directory after Playwright exits, including when a test fails.

Do not run an in-place production build while the original server is using
`.next`; the E2E command's build is isolated.

## Current verified suite

As of 7 November 2026:

| File | Focus |
| --- | --- |
| `tests/money.test.ts` | basis-point rounding, discounts, parsing, formatting |
| `tests/contracts.test.ts` | public table rules, cash-only schema, catalog versioning |
| `tests/integration-auth-rbac.test.ts` | seed idempotency, login, session hashes, CSRF, revocation, RBAC |
| `tests/integration-orders.test.ts` | POS sync, idempotency, partial failures, concurrency, rollback, tenant isolation, public orders, KDS |
| `tests/offline-queue.test.ts` | durable queue, pruning, sync outcomes, retry key stability |
| `tests/db-bootstrap.test.ts` | PGlite atomic lock contention, lock ownership/release, persistent cross-process reopening |
| `tests/db-lifecycle.test.ts` | constructor/readiness/migration/shutdown cleanup and handle lifecycle |
| `tests/postgres/postgres-validation.test.ts` | real PostgreSQL: lifecycle, migrations, constraints/indexes, transactions, concurrency/locking, POS idempotency, tenant isolation, reconnect persistence, error recovery |
| `tests/e2e/core.spec.ts` | browser-level operational workflow (Playwright; run separately) |

`npm test`: **7 Vitest files, 59 tests passed**.
`npm run typecheck`: **passed**.
`npm run test:e2e`: **1 Playwright workflow passed**, including an isolated
production build.

## Automated browser workflow coverage

The Playwright workflow verifies:

- Owner login to HQ and cashier login to POS; cashier access to HQ is rejected.
- Online POS cash checkout and server-side persisted order state.
- An offline sale remains queued after a page reload, then synchronizes after
  reconnect.
- Replaying the same client order ID is idempotent.
- Kitchen and bar see only their own ticket lines; ticket transitions complete
  the order after both stations finish.
- Public pickup ordering returns a placed, unpaid order.

## What the integration suite proves

- Concurrent submission of the same client order ID creates one order; replay
  returns the existing result.
- Concurrent unique orders receive distinct order numbers.
- Partial batch failure preserves successful results and reports failed items.
- Cross-outlet duplicate client IDs are rejected.
- A payment constraint failure rolls back the order, lines, tickets, and
  counter mutation.
- Mixed bar/kitchen orders create one ticket per station with item snapshots.
- Cash totals, tax, service, change, and discounts are persisted from server
  pricing, not client totals.
- A stale expected total returns `PRICE_CHANGED` with server details and writes
  no order. Re-sending with the corrected total succeeds.
- Cross-tenant outlet, product, ticket, and HQ access does not resolve.
- Public storefront selection is deterministic; public order time and price
  come from the server, and public pickup orders are unpaid.
- Kitchen and bar queues are isolated; invalid ticket transitions are rejected,
  repeated transitions are idempotent, and the parent order completes only
  after both station tickets complete.
- The offline queue writes before sync, retains conflicts/rejections, and keeps
  the same idempotency key across network failure and retry.
- Competing PGlite processes cannot both acquire the lock; a process cannot
  remove a replacement owner's lock; a later process can reopen a persistent
  database after clean shutdown.

## Real PostgreSQL validation

`npm test` uses PGlite and remains the fast in-process suite. It is not a
substitute for PostgreSQL validation.

`npm run test:postgres` requires `HANSAN_TEST_POSTGRES_URL`, which must point at
a disposable PostgreSQL server. The suite creates a uniquely named database for
each run, applies the real Drizzle migration, exercises the production
node-postgres code path, and drops every database it created. It never connects
to `.data/pglite` or an application database.

The GitHub Actions `PostgreSQL validation` job runs this suite against a
`postgres:17` service container. Locally, any reachable PostgreSQL 13+ server can
be used, for example:

```bash
HANSAN_TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:postgres
```

The suite covers:

- Connection, `current_database()`, server address, and pool shutdown.
- Migration application, idempotent re-run, all 17 tables, documented indexes,
  and check constraints.
- Check/unique violations with automatic recovery.
- Transaction commit and rollback.
- Concurrent distinct orders receiving unique order numbers.
- Row-level locking on the outlet order counter.
- Concurrent and sequential replay of one client order id.
- Cross-outlet replay rejection and cross-tenant isolation.
- Committed data surviving an application/connection-pool restart.
- SQL errors and recovery after server-side connection termination.

A full PostgreSQL server-process restart is not automated; the reconnect test
covers application and connection-pool restarts against the same server.

## Not validated by this suite

- PostgreSQL server-process restart, failover, replication, backup/restore, and
  production network topology. The CI job uses one disposable container.
- Service-worker cache behavior under browser storage pressure, accessibility,
  visual regression, load/soak, and penetration testing.
- Payment-provider integration (not implemented).

## Test data

Integration tests create isolated tenants, operators, products, and orders.
Demo credentials are generated per run and seeded only into isolated test
databases; the browser test does not use production or `.data/pglite`. Tests do
not require or use the development server on port 3000.
