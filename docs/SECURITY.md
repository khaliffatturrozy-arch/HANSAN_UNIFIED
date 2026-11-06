# Security baseline

This document describes controls that are implemented and the gaps that remain.
It is not a certification or a penetration-test report.

## Implemented controls

### Authentication and sessions

- Passwords are hashed with scrypt (`N=16384`, `r=8`, `p=1`, 64-byte key) and a
  random 16-byte salt per password. Parameters are encoded with each hash.
- Unknown accounts and wrong passwords return the same public error.
- Session tokens and CSRF tokens are 256-bit random values. Only SHA-256 hashes
  are stored in PostgreSQL.
- Session cookies are HttpOnly, SameSite=Lax, path `/`, and `Secure` in
  production. Sessions expire after eight hours and can be revoked server-side.
- Session resolution re-checks the user, tenant, outlet, membership role, and
  outlet grants against current database state.

### Request protection

- State-changing authenticated APIs require an `x-csrf-token` matching the
  session-bound hash.
- Browsers sending an `Origin` header must match the request host.
- Zod schemas validate method inputs, UUIDs, enums, lengths, integer ranges, and
  money fields.
- API responses use `Cache-Control: no-store`.
- A per-process fixed-window rate limiter covers login by IP and identity, public
  catalog, and public order creation.

### Authorization and isolation

- Service functions call `requirePermission` and `assertOutletAccess`; route
  handlers are not the only gate.
- Tenant-owned rows carry `tenant_id`, and service reads filter by the actor's
  tenant. Cross-tenant ticket/outlet/product IDs do not resolve.
- Kitchen and bar staff are station-scoped in the KDS service.
- HQ pages redirect unauthorized roles; API calls return 403.

### Data integrity

- Foreign keys and check constraints enforce known order, payment, and ticket
  states, positive quantities, valid stations, non-negative money, and bounded
  tax/service rates.
- Order lines snapshot product name, station, and unit price so later catalog
  changes do not rewrite history.
- Idempotency is enforced by a unique tenant/client order ID and duplicate
  handling.
- Order and ticket mutations write `order_events` and `audit_logs`.
- Server-side re-pricing prevents client price tampering.
- Public orders ignore client timestamps.

### Browser and deployment headers

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`
- Referrer policy, permissions policy, COOP, and HSTS in production
- No third-party script origins

### Offline terminal

- Sales are persisted before receipt display.
- The service worker never caches API/RSC responses.
- Conflicts and rejects are retained; only synced rows older than seven days are
  pruned.
- Offline mode is visibly labelled, and cash-only support is stated in the UI.

## Known gaps and required hardening

1. **CSP uses `'unsafe-inline'` for scripts.** Next.js bootstrap scripts need a
   nonce-based CSP before removing it. This is the next browser-hardening task.
2. **Rate limits are in-process.** Multi-instance deployments need Redis or a
   database-backed limiter. Restarting a process resets limits.
3. **No MFA, password reset, or invitation flow.** Staff accounts are seeded or
   provisioned directly in this slice.
4. **No refund UI or payment-provider integration.** Cash only. QRIS/EDC are
   schema options, not supported workflows.
5. **No automated backup or restore drill.** PostgreSQL backup/retention must be
   configured by the operator.
6. **No nonce/replay cache for CSRF tokens.** The token is session-bound; rotating
   it on privilege change is not implemented.
7. **Audit logs are append-only by application convention.** A database role that
   can update rows can alter them; restrictive grants and external log shipping
   are deployment responsibilities.
8. **No content-security report collector or SIEM integration.**
9. **Request-body size limit is enforced by the reverse proxy.** Set a limit such
   as 1 MB at the edge; route handlers do not buffer-check large bodies.
10. **PGlite single-node mode is not a high-availability database.** Use managed
    PostgreSQL for production.
11. **Forwarded host and client-IP headers require a trusted ingress.** Origin
    checks and IP-based rate limits depend on the reverse proxy overwriting
    untrusted `Host`, `X-Forwarded-Host`, and `X-Forwarded-For` values. That
    deployment configuration was not verifiable in this environment.
12. **Full dependency audit reports four moderate development-tooling findings**
    in nested `esbuild@0.18.20` through Drizzle Kit's ESM loader. The production
    dependency audit reports zero vulnerabilities. The suggested forced fix
    downgrades Drizzle Kit and was not applied; reassess with a compatible
    upstream update.
13. **Staff administration is read-only.** `GET /api/hq/staff` and the staff
    page do not create accounts or change roles/grants. Safe provisioning needs
    owner/admin authorization, tenant-scoped membership and outlet grants,
    auditable transactions, permission-change session revocation, and tests.

## Production checklist

- [ ] HTTPS terminated with a valid certificate; cookies are `Secure`.
- [ ] `HANSAN_DB_DRIVER=postgres`, strong unique `DATABASE_URL` credentials.
- [ ] `HANSAN_DEMO_MODE=false`; `HANSAN_DEMO_PASSWORD` unset; demo seed not run.
- [ ] `HANSAN_AUTO_MIGRATE=false`; migrations run as a controlled release job.
- [ ] Reverse proxy body limit and timeout configured.
- [ ] Reverse proxy overwrites untrusted `Host`, `X-Forwarded-Host`, and
      `X-Forwarded-For` headers; rate limits and origin checks rely on them.
- [ ] Verify ingress header behavior; do not expose the app directly if forwarded
      headers are not sanitized.
- [ ] Database backups, PITR, and restore test scheduled.
- [ ] Rate limiting moved off-process or single-instance topology accepted.
- [ ] Log aggregation and alerting for 5xx, auth failures, and sync conflicts.
- [ ] Staff accounts provisioned with unique credentials; demo accounts removed.
- [ ] CSP nonce hardening scheduled before external exposure at scale.

## Reporting a vulnerability

Do not open a public issue with exploit details. Contact the platform operator
through their private security channel and include reproduction steps, affected
version, and impact.
