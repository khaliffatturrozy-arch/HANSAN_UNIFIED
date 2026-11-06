# HANSAN V4 architecture

## Shape

HANSAN V4 is a modular monolith: one deployable Next.js application, one
authoritative PostgreSQL database, and explicit domain modules with no UI
imports inside them.

```
src/app                 Next.js routes, server pages, client surfaces
src/modules/ordering    catalog, order persistence, POS sync, public orders
src/modules/kitchen     KDS queue and ticket transitions
src/modules/hq          headquarters queries and commands
src/modules/identity    passwords, sessions, RBAC, login
src/modules/shared      money and typed application errors
src/db                  schema, client, migrations, seed
src/lib                 API helpers, auth adapters, device storage, formatting
drizzle                 generated SQL migrations
tests                   unit + PGlite integration + IndexedDB queue tests
```

Pages and route handlers are adapters. Business rules live in service modules so
the POS, KDS, HQ, and storefront cannot silently diverge.

## Request and data flow

```
Browser / POS / KDS
        │  same-origin JSON + session cookie + CSRF header
        ▼
Next route handler ── validates Zod input, resolves session, CSRF
        │
        ▼
Domain service ── permission check, outlet access, money, state machine
        │
        ▼
Drizzle ORM ── transaction
        │
        ▼
PostgreSQL (PGlite in local development/tests)
```

Server components use the same session resolver against the database. The POS
shell is deliberately unauthenticated at the page level so it can render offline;
all business data comes from authenticated APIs and a previously cached catalog.

## Tenancy and authorization

- Every tenant-owned business table has an explicit `tenant_id`.
- Service queries also filter by tenant; a valid ID from another tenant is
  reported as not found where disclosure would matter.
- Non-admin roles have explicit outlet grants stored in `outlet_grants`.
- `owner` and `org_admin` are tenant-wide. Owner is the only role with refund
  permission; discounts require `pos:discount`.
- KDS additionally constrains kitchen staff to the kitchen station and bar staff
  to the bar station at the service layer.
- The UI hides unavailable surfaces, but the server is authoritative.

## Identity and sessions

1. Email is normalized; scrypt verifies a per-user salted hash.
2. Unknown accounts verify against a dummy hash to reduce timing differences.
3. A random 256-bit session token is stored only as a SHA-256 hash. The raw token
   is sent in an HttpOnly, SameSite=Lax cookie.
4. A separate CSRF token is stored hashed in the session row and delivered to the
   browser in a readable same-site cookie. Mutations compare the header token with
   the stored hash using `timingSafeEqual`.
5. Session resolution re-checks user activity, tenant status, outlet activity,
   outlet ownership, and current outlet grants on every request.
6. Logout revokes the server-side session.

## Pricing

All money is integer minor units. `calculateTotals` is the single implementation:

```
discounted = subtotal - min(discount, subtotal)
tax        = roundHalfUp(discounted * taxBps / 10000)
service    = roundHalfUp(discounted * serviceChargeBps / 10000)
total      = discounted + tax + service
```

The browser may display an estimate, but the server always re-prices from the
current outlet catalog. The POS queue includes its expected total; a mismatch is
an explicit conflict, not an accepted order.

## Offline POS protocol

```
cashier completes sale
  └─ IndexedDB write (durable, before receipt)
       └─ queue status pending
            ├─ online: POST /api/pos/sync (batch ≤20)
            │    ├─ accepted → synced (server id + number)
            │    ├─ PRICE_CHANGED → conflict (details retained)
            │    ├─ other AppError → failed (retained)
            │    └─ 401/403 → authRequired, row stays pending
            └─ offline/network error → pending, retry later
```

Idempotency is keyed by `(tenant_id, client_order_id)`. The server also treats a
database unique violation as a duplicate, so an ambiguous network failure cannot
create a second order after the transaction committed. Device time is bounded to
90 days in the past and 10 minutes in the future; the original business time is
preserved for reporting.

Cash is the only offline payment. A QRIS or EDC integration must be designed
against provider-side idempotency before it can be offered offline.

## Order and ticket state

```
order:  placed ──► completed
           └────► cancelled (not exposed in this slice)

ticket: queued ──► accepted ──► preparing ──► ready ──► completed
```

Tickets are created per station and contain line snapshots. Completing a ticket
locks the parent order row (`SELECT … FOR UPDATE`), then checks whether any other
ticket is incomplete. The order becomes `completed` only when the last ticket
completes. Payment status is independent of kitchen progress.

## Public ordering

- Tenant slug resolves only an active tenant.
- The public outlet is selected deterministically by ascending outlet code, not
  by undefined database row order. This release exposes one public outlet per
  tenant.
- Dine-in requires a table label; pickup rejects one. Validation exists both at
  the API boundary and inside the service.
- Client `occurredAt` is ignored. Public orders use the server clock.
- Public orders are unpaid and pay-at-counter. No card data is collected.
- Public catalog output is a deliberately reduced shape: no tenant IDs, staff,
  cost, or internal flags.

## PGlite and PostgreSQL

`src/db/client.ts` selects the driver:

- `HANSAN_DB_DRIVER=postgres` or production `DATABASE_URL`: `pg` connection pool.
- Otherwise: embedded PGlite with durable files (default `.data/pglite`).

The same Drizzle schema and SQL migrations apply to both. PGlite is a real
PostgreSQL build for development and tests, not a mock. Production still requires
standard PostgreSQL for concurrency, backup, and high availability. PGlite in
production is only permitted when explicitly opted in for a single-node install.

## Service worker and installability

- `public/sw.js` caches the offline page, manifest, icons, static Next assets, and
  the `/pos` navigation shell only. HQ and KDS HTML is never cached because it can
  contain tenant business data.
- It never caches `/api/` responses or RSC payloads. Stale sales data must not be
  presented as current.
- `public/manifest.webmanifest` and 192/512 PNG icons provide installability.
- The service worker registers automatically in production; development opts in
  with `NEXT_PUBLIC_ENABLE_SW=true`.

## Deliberate boundaries

- No microservices, event bus, or background worker in this slice.
- No offline KDS or HQ.
- No provider abstraction pretending that unintegrated payments exist.
- No fake production data or placeholder pages.
