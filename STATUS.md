# HANSAN V4 status

**Date:** 7 November 2026
**Scope:** functioning vertical slice in `HANSAN_UNIFIED/HANSAN_V4`
**Deployment status:** not deployed

## Repository preparation (7 November 2026)

- Prepared `HANSAN_V4` as the standalone repository root. Legacy `HANSAN.ID-2`
  remains a separate repository and is not part of this baseline.
- Removed hardcoded demo passwords. Demo seeding now requires explicit
  `HANSAN_DEMO_MODE=true`, a local-only `HANSAN_DEMO_PASSWORD` of at least 12
  characters, and refuses to run when `NODE_ENV=production`.
- `npm run typecheck` now runs `next typegen` before `tsc --noEmit`;
  `next-env.d.ts` is generated and ignored.
- Added program documentation under `docs/program/` and the historical V2 audit
  under `docs/audit/v2/`; originals remain in the workspace.
- Added the GitHub Actions workflow `.github/workflows/ci.yml` for typecheck,
  tests, build, production dependency audit, and isolated Playwright E2E.

Validation on 7 November 2026:

- `npm run typecheck`: passed.
- `npm test`: 8 files, 61 tests passed.
- `npm run build`: passed.
- `npm run test:e2e`: 1 browser workflow passed.
- `npm audit --omit=dev`: 0 vulnerabilities.

## Real PostgreSQL validation (7 November 2026)

Local PostgreSQL and Docker remain unavailable on this workstation. Validation
ran in GitHub Actions against a disposable `postgres:17` service container; it
is not a PGlite result. The suite creates uniquely named databases, applies the
real Drizzle migration through node-postgres, and drops every database it
creates.

- CI run: `https://github.com/khaliffatturrozy-arch/HANSAN_UNIFIED/actions/runs/42302296209`
- Commit: `abb0629c4b5f65b2008c907068b0e358e0baa6cb`
- Result: the `PostgreSQL validation` job and all other CI jobs passed.
- Covered: connection/lifecycle, migration idempotency, the 17-table schema,
  indexes and check constraints, transaction commit/rollback, concurrent
  order-number allocation, row-level locking, sequential and concurrent POS
  replay idempotency, cross-outlet replay rejection, tenant isolation, reconnect
  persistence, SQL error recovery, and recovery after server-side connection
  termination.
- The run exposed and fixed a cross-driver defect: Drizzle wraps node-postgres
  errors, so `order-service` had not detected PostgreSQL unique violations during
  concurrent replay. `src/db/pg-errors.ts` now unwraps the cause chain.
- `npm test` on the workstation after the fix: 8 files, 61 tests passed.
- Not covered: PostgreSQL server-process restart, failover, replication,
  backup/restore, Compose startup, or production ingress.

## Database runtime verification (5 November 2026)

- Added exclusive canonical-path PGlite sidecar locks. A second process using
  the same persistent directory is refused before opening PGlite.
- Lock metadata records the canonical database directory, PID, approximate
  process start time, and a unique token. Startup never removes an existing
  lock. Manual stale-lock guidance requires path, process start time, and
  database-user verification; uncertain ownership remains fail-closed.
- Failed readiness or migration attempts close and evict the cached handle.
  Successful close releases the lock; failed close evicts the handle but keeps
  the lock to prevent unsafe reuse.
- Isolated reproduction established that concurrent processes can race during
  PGlite initialization or migration. The original `waitReady` abort text was
  not deterministically reproduced. The active `.data/pglite` database was not
  inspected or changed.
- Verified isolated persistent database migration-history retention, restart,
  sequential/concurrent login, and that `/api/health` reports failure when a
  second process is refused. A fresh isolated directory verified that a
  successful close releases the lock and permits a later process to reopen the
  database and log in. These checks do not validate PostgreSQL production.
- The original `RuntimeError: Aborted()` incident was observed during
  `waitReady()`, before migration SQL or authentication. Shared-directory
  concurrent initialization is reproducible and is now refused by the lock;
  the exact historical incident's process ownership was not captured, so its
  cause is not claimed as conclusively established.

## Verified in this workspace

| Check | Result |
| --- | --- |
| `npm test` | 8 files, 61 tests passed |
| `npm run typecheck` | Passed |
| `npm run test:e2e` | 1 Playwright workflow passed; isolated production build and test server |
| E2E cleanup | 0 `hansan-e2e-*` temporary directories remained after the final run |
| Original server | `/api/health` returned HTTP 200; port 3000 was not stopped |
| Isolated persistent PGlite routes | Cold concurrent login (3/3 HTTP 200), repeated login, health, competing-process refusal (HTTP 500), clean close, restart, and login passed |
| Existing `.data/pglite` database | Not inspected or modified |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Full `npm audit` | 4 moderate findings in nested development-tooling `esbuild`; no forced dependency downgrade applied |
| PostgreSQL / Docker | PostgreSQL 17 validated in CI on 7 November 2026; Docker Compose startup still not run |
| V1/V3 comparison | Not possible (source repositories absent) |

Only the checks marked passed should be treated as evidence.

## Core operational browser E2E (5 November 2026)

Manual browser checks ran against isolated production builds backed by fresh,
temporary PGlite directories. The build output, databases, and test servers were
separate from the original server and `.data/pglite`.

- **Authentication and access:** The normal login showed only email/password,
  with no demo account panel or role selector. Owner login redirected to HQ;
  cashier login redirected to POS. A cashier request for `/hq` returned to
  POS. Kitchen staff were denied the bar-ticket API with HTTP 403, while the
  bar role saw bar tickets only.
- **HQ:** Created an isolated E2E outlet and verified it appeared in the
  three-outlet list. The staff directory showed all six seeded memberships and
  their server-assigned roles. Account creation, role changes, and grant
  revocation remain unavailable in the UI.
- **POS and server persistence:** An online cash sale containing one bar item
  and one kitchen item was accepted as `MAIN-0002` for Rp 89,320. The HQ
  overview API reported the paid order and two open station tickets.
- **KDS:** Kitchen and bar views showed only their own ticket lines. Both
  station tickets completed the queued → accepted → preparing → ready →
  completed transitions. After the first station completed, one ticket
  remained open; after the second, the server overview reported zero open
  tickets and the order as completed.
- **Offline POS and idempotency:** After the POS shell was cached online, the
  browser was taken offline, a Rp 37,120 cash sale was queued, and the page was
  reloaded offline. The terminal returned from the service-worker shell and
  still showed one queued sale. After network restoration, manual sync created
  `MAIN-0003`. Replaying the same client order ID returned the same server
  order with `duplicate: true`; the HQ overview remained at two paid POS
  orders, totaling Rp 126,440.
- **Public ordering:** A pickup order placed on `/store/demo` returned
  `MAIN-0004` as placed and unpaid for Rp 37,120. The HQ overview then reported
  three orders and the unpaid storefront order.
- **Responsive screens:** Browser evidence was captured for login, HQ overview,
  outlets, staff/access, tablet POS, mobile POS order drawer, public storefront,
  and mobile KDS. The mobile ticket-card contrast issue found during inspection
  was corrected and rechecked on the final isolated build.

The first offline reload before a POS-shell cache existed showed the generic
offline fallback; after one successful online POS navigation warmed the shell,
offline reload restored the terminal as expected.

## Core reliability and production-readiness gate (5 November 2026)

### Completed and verified

- Added automated cross-process PGlite lock contention and ownership tests,
  replacement-lock release safety, persistent database reopening in a new
  process, and successful shutdown/recreation coverage. Existing constructor,
  readiness, migration, and shutdown failure-path tests remain in the suite.
- Added transaction-integrity coverage for partial batch failure, concurrent
  duplicate replay, concurrent order-number allocation, cross-outlet duplicate
  IDs, rollback after a payment constraint failure, and invalid/idempotent KDS
  transitions.
- Added a repeatable Playwright browser workflow for owner login to HQ, cashier
  login to POS, cashier HQ denial, online cash checkout, offline sale
  persistence across reload, reconnect sync, duplicate replay, server-persisted
  order verification, kitchen/bar isolation and ticket completion, and public
  pickup ordering.
- The E2E harness builds and serves a temporary project copy with its own
  temporary PGlite database. It excludes the working `.data`, `.next`,
  `node_modules`, and `.env*`; the successful run did not use the original
  database, build output, or port-3000 server. The parent runner removes its
  exact per-run temporary directory after Playwright exits; the final run left
  zero matching temporary directories.
- `npm test`: **8 files, 61 tests passed**.
- `npm run typecheck`: **passed**.
- `npm run test:e2e`: **1 Playwright workflow passed**, including isolated
  `next build --webpack` and browser verification; temporary-directory cleanup
  verified.
- `npm audit --omit=dev`: **0 vulnerabilities**. Full `npm audit` reports four
  moderate findings in nested `esbuild@0.18.20` through Drizzle Kit's
  development-time ESM loader. The suggested forced remediation downgrades
  Drizzle Kit; it was not applied.

### PGlite lock evidence

The existing lock implementation was preserved. It uses exclusive `wx`
creation, per-owner identity metadata, owner-checked release, and fail-closed
stale-lock handling. Automated tests verify that competing processes cannot
both acquire the lock, a process does not remove a replacement owner's lock,
and a later process can reopen a persistent database after clean shutdown.
Existing tests cover constructor, readiness, migration, and shutdown failures.
An uncertain/stale lock is not automatically deleted. These application tests
do not establish PostgreSQL multi-process behavior.

### PostgreSQL validation status (updated 7 November 2026)

At the time of the 5 November gate, `psql`, `pg_ctl`, `docker`, and
`docker-compose` were unavailable, and localhost:5432 did not accept a
connection. PostgreSQL behavior was not validated locally then.

On 7 November 2026 the dedicated suite passed against a real `postgres:17`
server in GitHub Actions, covering migrations, constraints, transactions,
concurrency, locking, POS idempotency, tenant isolation, reconnect persistence,
and error recovery. See the validation section at the top of this file. PGlite
results remain supplementary and are not treated as PostgreSQL evidence.

### Security and administration assessment

- Session token hashing, HttpOnly/SameSite cookies, session-bound CSRF,
  server-side role/grant resolution, tenant/outlet checks, service-level
  authorization, input schemas, and server-side public-order pricing are
  implemented and exercised by tests.
- Deployment still depends on a trusted reverse proxy overwriting forwarded
  host/IP headers. This environment did not verify that ingress configuration.
  CSP permits inline scripts; rate limiting is process-local; request-size
  enforcement depends on the proxy. MFA, password reset, and staff invitations
  are not implemented.
- `GET /api/hq/staff` and the staff page are read-only. Minimum provisioning
  requires owner/admin-authorized account invitation or one-time credential
  setup, tenant-scoped membership and role assignment, outlet grants,
  transactional audit records, permission-change session revocation, and
  tests. This gate did not expand scope to implement it.

### Gate decision: NO-GO for expanding business modules

The isolated app logic, PGlite lifecycle, and browser workflows pass. PostgreSQL
is now validated in CI; deployment ingress remains unvalidated, staff
provisioning is incomplete, and the identified operational/security hardening
remains. Resolve the deployment controls before expanding the next business
modules or claiming production readiness.

## Working surfaces

### POS

- Staff login and session-bound CSRF.
- Outlet catalog fetch and IndexedDB cache.
- Durable offline queue written before receipt.
- Cash checkout, change calculation, discounts for authorized roles.
- Server re-pricing and price-change conflicts.
- Automatic and manual sync, conflict/rejection ledger, local receipts.
- Service worker shell caching in production.

### Kitchen display

- Polling ticket queue with kitchen/bar isolation.
- Ticket transition enforcement and idempotent retries.
- Order completion only after all station tickets complete.
- Session and station access enforced server-side.

### HQ

- 24-hour and seven-day overview from live orders.
- Outlet creation with tax/service configuration.
- Catalog listing, creation, and availability toggles.
- Staff directory and role summary.
- Finance read access, manager/owner write boundaries.

### Public

- Landing page and `/store/demo` storefront.
- Server-priced pickup and dine-in ordering.
- Dine-in table requirement, pickup rejection of a table.
- Server-time and unpaid pay-at-counter confirmation.
- Deterministic public outlet selection.
- Basic public catalog/order rate limits.

### Platform

- 17-table PostgreSQL schema with constraints and indexes.
- Drizzle migrations, PGlite local runtime, PostgreSQL runtime path.
- Idempotent demo seed clearly labelled in the UI.
- Security headers, CSP baseline, HttpOnly session cookies.
- Dockerfile, Compose topology, runtime migration runner.
- Architecture, security, operations, testing, and ADR documentation.

## Known gaps

1. QRIS, card/EDC, refunds, split payment, and provider reconciliation are not
   implemented. Cash is the only supported payment.
2. Public storefront exposes one outlet per tenant; multi-outlet routing is future
   work.
3. Staff invitations, role changes, and grant editing are not in the UI.
4. KDS uses polling, not push transport.
5. Receipt hardware printing, inventory, purchasing, loyalty, payroll, and
   accounting integrations are outside this slice.
6. First-visit offline reload requires a previously cached POS shell; offline
   reload after an online POS visit was browser-tested successfully.
7. CSP still allows inline scripts. A nonce-based CSP is required before removing
   that exception.
8. Rate limiting is per process.
9. PGlite is not HA and is not a production multi-instance database.
10. Load and penetration testing remain outstanding; automated operational
    browser E2E coverage is now present.

## Verification constraints

- **No local PostgreSQL or Docker:** production database networking, backup, and
  Compose startup are authored but unvalidated locally. The CI suite now
  validates migrations, constraints, concurrency, and recovery against
  PostgreSQL 17; PGlite integration tests remain supplementary.
- **V1 and V3 source absent:** no parity claim, migration, or comparative audit is
  made. Existing V1/V3 audit documents in the workspace were treated as stale.
- **Git:** the baseline and PostgreSQL validation batches are published on
  `main`; no deployment has been performed.

## Next priorities

1. Run the Compose topology end to end and validate production ingress,
   backup/restore, and a PostgreSQL server-process restart.
2. Add nonce-based CSP and move rate limits to shared storage.
3. Add online payment, refunds, and receipt printing only with provider-level
   idempotency and reconciliation.
4. Add staff provisioning and per-outlet public storefront routing.
5. Add load/security tests.
