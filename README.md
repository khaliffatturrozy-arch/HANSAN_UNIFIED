# HANSAN V4

An integrated F&B operating platform for multi-outlet operators: POS, kitchen
display, headquarters, and a public online-ordering storefront on one database
and one pricing engine.

This directory is a clean modular-monolith implementation. It does not reuse
the broken V2 interface; it reuses proven domain ideas where they were sound.

## What is implemented

- **POS terminal** with a durable IndexedDB queue, client-generated idempotency
  keys, cached menu, cash checkout, discounts for authorized roles, automatic
  retry, and visible offline state.
- **Server re-pricing** on every order, including an explicit `PRICE_CHANGED`
  conflict payload when an offline price is stale.
- **Kitchen display** with separate kitchen/bar queues, role and station
  isolation, a queued → accepted → preparing → ready → completed state machine,
  and order completion only when all station tickets are complete.
- **Headquarters** overview, outlet creation, catalog creation/availability, and
  staff directory.
- **Public storefront** with pickup and dine-in ordering, server-side table
  validation, server-time order creation, and honest pay-at-counter status.
- **Multi-tenant access control** enforced in services, not just in the UI.
- **Server-side sessions, CSRF protection, scrypt passwords, rate limiting, audit
  logs, and order event history.**
- **PostgreSQL schema** with checks, foreign keys, and composite tenant/outlet
  indexes, plus an embedded PGlite path for local development and tests.

## Stack

| Layer | Choice |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4, project design tokens |
| Data | Drizzle ORM 0.45, PostgreSQL |
| Local/test DB | PGlite (real PostgreSQL engine, embedded) |
| Validation | Zod 4 |
| Device storage | IndexedDB through `idb` |
| Tests | Vitest 5, PGlite integration tests, fake-indexeddb |

## Quick start

Requires Node.js 22+ and npm.

```powershell
Copy-Item .env.example .env.local
# Edit .env.local: set HANSAN_DEMO_MODE=true and a local-only
# HANSAN_DEMO_PASSWORD of at least 12 characters.
npm install
npm run dev
```

Open `http://localhost:3000`.

Development uses the embedded PGlite database at `.data/pglite` and runs
migrations automatically. Demo seeding is explicitly opt-in: set
`HANSAN_DEMO_MODE=true` and a local-only `HANSAN_DEMO_PASSWORD` in `.env.local`
before the first start. No database server and no committed demo password are
required.

### Demo surfaces

| Surface | URL |
| --- | --- |
| Public site | `/` |
| Online ordering | `/store/demo` |
| POS terminal | `/pos` |
| Kitchen display | `/kds` |
| Headquarters | `/hq` |
| Login | `/login` |

Demo accounts are seeded only in isolated development/test environments after
an explicit opt-in. The demo password is supplied locally through
`HANSAN_DEMO_PASSWORD`; no usable demo password is committed or displayed in
this guide. Production requires an organization operator to provision staff
accounts; the demo seed refuses to run in production.

## Commands

```bash
npm run dev          # development server
npm run typecheck    # TypeScript, including tests
npm test             # Vitest suite (PGlite)
npm run test:postgres # real PostgreSQL validation (requires HANSAN_TEST_POSTGRES_URL)
npm run build        # production build
npm start            # serve the production build
npm run db:generate  # generate a migration after schema edits
npm run db:migrate   # apply migrations (tsx)
npm run db:seed      # seed demo data (requires explicit demo env)
npm run db:migrate:prod # compiled migration runner for runtime images
```

## POS offline model

1. The cashier completes a sale. A queue row is written to IndexedDB **before**
   the UI shows the receipt.
2. The order carries a client-generated UUID, device time, catalog version, line
   snapshots, and expected total.
3. When online, the browser sends up to 20 rows per outlet. The server ignores
   client prices, re-reads the current catalog, and re-prices the order.
4. A matching UUID is returned as a duplicate, never inserted twice.
5. A stale total returns `PRICE_CHANGED` with the server's breakdown. The sale is
   retained on the device for review; it is not silently rewritten or deleted.
6. Other rejections are retained as `failed`; synced rows are pruned after seven
   days. Unresolved rows are never automatically deleted.
7. Offline cash is the only supported offline payment. QRIS and card/EDC are not
   integrated in this release.

The page shell can reload offline after it has been cached, and the last
authenticated catalog response is available from IndexedDB. A service worker
caches only static application assets and navigations, never API responses.

## Deployment

A production-style container setup is included:

```bash
# Create .env with POSTGRES_PASSWORD, then:
docker compose up --build
```

The app container runs pending migrations before starting the server and uses
PostgreSQL as the authoritative database. For cloud deployments, use managed
PostgreSQL, run `npm run db:migrate:prod` as a release job, and set:

```text
HANSAN_DB_DRIVER=postgres
DATABASE_URL=postgresql://...
HANSAN_AUTO_MIGRATE=false
HANSAN_DEMO_MODE=false
NEXT_PUBLIC_APP_URL=https://your-host
```

Never run the embedded PGlite driver in a multi-instance production deployment.
See [docs/OPERATIONS.md](docs/OPERATIONS.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Operations](docs/OPERATIONS.md)
- [Architecture decision records](docs/adr/)
- [Program documents](docs/program/)
- [Historical V2 audit](docs/audit/v2/)
- [Current status](STATUS.md)

## Scope and known limitations

This is a functioning vertical slice, not a claim of feature completeness. Not
yet implemented: QRIS/card acquiring, refunds, split payments, receipt printing
to hardware, supplier/inventory/payroll modules, staff invitations and role
editing through the UI, multi-outlet public storefront routing, offline KDS, and
nonce-based CSP. The source repositories for V1 and V3 were not available in this
workspace, so no V1/V3 comparison or migration is claimed.

See [STATUS.md](STATUS.md) for the verified state and remaining gaps.
