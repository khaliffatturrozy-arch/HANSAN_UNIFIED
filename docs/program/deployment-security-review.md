# HANSAN UNIFIED — Deployment Security Review (WS2)

**Date:** 11 November 2026
**Precedence:** NO-GO continuation only. No business-module changes, no deployment, no production migrations.
**Source of truth used:** `HANSAN_UNIFIED/HANSAN_V4` implementation files reviewed directly.

## Outcome summary

| Workstream | Verdict |
| --- | --- |
| Reverse-proxy forwarded-header sanitization | ❌ **Unverified** (no reverse proxy present in repo; code consumes forwarded headers without a trusted-proxy boundary) |
| TLS and trusted-proxy configuration | ❌ **Unverified** (TLS only represented by HSTS header in production; no cert/proxy config in repo) |
| CSP and inline-script requirements | ⚠️ **Partial** (`frame-ancestors 'none'` present; scripts still `'unsafe-inline'` — nonce mandated) |
| Distributed rate limiting | ❌ **Unverified** (current limiter is per-process in-memory; Redis/shared store required for multi-instance) |
| Request-size enforcement | ❌ **Unverified** (assumed enforced by reverse proxy; no proxy config committed) |

**Overall:** No deployment security control is currently verified against a live reverse proxy or TLS boundary. The controls that exist are authored, but none were executable here (terminal environment unavailable; `docker`/`nginx` not installed).

---

## 1. Reverse-proxy forwarded-header sanitization

### Control statement
Forwarded `Host`, `X-Forwarded-Host`, and `X-Forwarded-For` must be overwritten by a trusted ingress proxy and never accepted from a client. Origin checks, IP-based rate limiting, and multi-instance scaling depend on these values.

### What the code does

`src/lib/api.ts` reads the forwarded values without confirming a trusted proxy owns them:

```ts
// x-forwarded-host is trusted unconditionally
const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

// x-forwarded-for is read directly; no proxy verification present
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
```

There is no Next.js trusted-proxy configuration and no reverse-proxy config committed to the repository.

### Verdict
**Unverified.** The forward-header handling is **dangerous by default** if the app is exposed directly or behind an untrusted proxy: a caller can spoof `X-Forwarded-Host` (bypass origin checks) and `X-Forwarded-For` (fake an IP for rate limiting). This is exactly gap #11 in `docs/SECURITY.md` and the documented next-hardening step in `docs/OPERATIONS.md` and `STATUS.md`.

### Required control (before exposure)
1. Terminate TLS behind a trusted proxy (nginx/Traefik/Caddy or managed CDN).
2. Proxy must overwrite `Host`, `X-Forwarded-Host`, and `X-Forwarded-For` from its own connection, not from client input.
3. Configure Next.js trusted-proxy (or equivalent) so client identity derives the real client from the proxy's sanitized headers.
4. Do not expose the app directly. Verify header behavior in staging before any public release.
## 2. TLS and trusted-proxy configuration

### Control statement
TLS must be terminated by a trusted ingress with a valid certificate, and the connection to the application must be trusted. No raw HTTP exposure to the internet.

### What exists

- `next.config.mjs` only emits the `Strict-Transport-Security` header in production:

```js
...(isProd
  ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
  : []),
```

- `docker-compose.yml` runs the app over plain HTTP on port 3000 and does not include TLS or a proxy service.

### Verdict
**Unverified.** TLS termination and the trusted-proxy layer are authored only as documentation (composition topology in `README.md`/`OPERATIONS.md`). No certificate, no HTTPS entry, no proxy is present in the repository and none was validated. Deploying without a proxy + TLS invalidates `Secure` cookie behavior and the `HSTS` claim.

### Required control (before exposure)
- Terminate HTTPS at the edge with a valid certificate.
- Set `Secure` on session cookies in production (present in code, but only meaningful behind HTTPS).
- Keep `HANSAN_AUTO_MIGRATE=false` behind the proxy.
- Do not expose port 3000 directly.

---

## 3. CSP and inline-script requirements

### Control statement
A restrictive Content-Security-Policy must prevent injection and data exfiltration, allowing only trusted origins and no inline scripts unless a nonce/hash is applied.

### What exists

`next.config.mjs` applies:

```js
"script-src 'self' 'unsafe-inline'",
"style-src 'self' 'unsafe-inline'",
"img-src 'self' data: blob:",
"font-src 'self' data:",
"connect-src 'self'",
"worker-src 'self' blob:",
"manifest-src 'self'",
"frame-ancestors 'none'",
"base-uri 'self'",

### Verdict
**Partially verified.** The header set is strong against external exfiltration and framing, but the inline-script exception defeats a primary XSS defence. The project itself records this as gap #1 and schedules a nonce-based CSP. A nonce is the next hardening step; until then, the CSP is a partial control, not verified production security.

### Required control (before exposing to untrusted users)
- Implement a CSP nonce and move `script-src` to `script-src 'self' 'nonce-<generated>'`.
- Use nonces on the inline scripts Next.js emits. This is explicitly scheduled in `STATUS.md` item 7.

---

## 4. Distributed rate limiting and request-size enforcement
"form-action 'self'",
## 4. Distributed rate limiting and request-size enforcement

### Control statement
A single-instance in-memory limiter is insufficient for production. Distributed limits must be backed by a shared store; request bodies must be bounded at the edge.

### What exists

- `src/lib/rate-limit.ts` (and `src/server/rate-limit.ts`) implement a **per-process fixed-window limiter** in process memory. `MAX_KEYS = 20_000` bounds memory.
- `docs/SECURITY.md` and `docs/OPERATIONS.md` document this as a known limitation: "Rate limits are per process. Move login/public-order limiting to Redis or a database if running multiple replicas."
- `docker-compose.yml` does not include a Redis or shared-store service.
- **Request-size enforcement:** `docs/SECURITY.md` gap #9 states: *"Request-body size limit is enforced by the reverse proxy. Set a limit such as 1 MB at the edge; route handlers do not buffer-check large bodies."* No proxy config is committed, so this is an assumption, not a verified control.

### Verdict
**Unverified.** Distributed rate limiting is **not implemented**; the current limiter is explicitly single-instance. Request-size enforcement is documented as a reverse-proxy duty but the proxy configuration is absent from the repo. This must be satisfied before production deployment.

### Required control
- Add a Redis/Upstash-backed rate limiter (login, public catalog, public order creation).
- Add a reverse-proxy body limit (e.g., 1 MB), `proxy_read_timeout`/`proxy_send_timeout`, and equivalent body-size limit at the edge.
- Use `Retry-After` header on 429 (already present in `jsonError`).

---

## 5. Audit-log hardening (deployment responsibility)

`docs/SECURITY.md` gap #7 notes: *"Audit logs are append-only by application convention. A database role that can update rows can alter them; restrictive grants and external log shipping are deployment responsibilities."* This remains a deployment concern, not an app-layer control. No verification was possible here.

## 6. Dependency audit

- `npm audit --omit=dev` → 0 vulnerabilities.
- Full `npm audit` → 4 moderate findings in nested `esbuild@0.18.20` through Drizzle Kit's ESM loader. The suggested downgrade was **not** applied (consistent with the restriction: no forced dependency downgrades).

## 7. Deployment assumptions and verified controls (at-a-glance)

| Item | Verified | Partially verified | Unverified |
| --- | --- | --- | --- |
| HSTS in production | ✅ | — | — |
| `frame-ancestors 'none'` | ✅ | — | — |
| `connect-src 'self'` | ✅ | — | — |
| `poweredByHeader: false` | ✅ | — | — |
| `Secure` session cookies (production) | ✅ authored | — | not live (no TLS) |
| Reverse-proxy forwarded-header sanitization | — | — | ❌ |
| TLS / trusted proxy | — | — | ❌ |
| CSP nonce (removing `'unsafe-inline'`) | — | — | ❌ (planned) |
| Distributed rate limiting | — | — | ❌ (per-process only) |
| Request-size enforcement at edge | — | — | ❌ (proxy not committed) |
| Audit-log grant hardening | — | — | ❌ (deployment duty) |

**Bottom line:** The application itself carries a usable security baseline, but none of the deployment bindings (proxy, TLS, distributed limits, body-size cap) were executable or verifiable in this session. All four are marked unverified pending staging evidence before production exposure.

---

*Generated for the HANSAN UNIFIED NO-GO continuation. No deployment, no production migrations, no dependency downgrades performed.*

```

Notable points:
- `frame-ancestors 'none'` ✅ blocks clickjacking.
- `connect-src 'self'` ✅ blocks cross-origin data exfiltration via fetch/XHR.
- No third-party script origins are allowed ✅.
- **`script-src '...\'unsafe-inline\'` is present** ❌ (Next.js bootstrap scripts require it today).
- `style-src '...\'unsafe-inline\'` ✅ acceptable for now, but styling drift should be tracked.

### Verdict
**Partially verified.** The header set is strong against external exfiltration and framing, but the inline-script exception defeats a primary XSS defence. The project itself records this as gap #1 and schedules a nonce-based CSP. A nonce is the next hardening step; until then, the CSP is a partial control, not verified production security.

### Required control (before exposing to untrusted users)
- Implement a CSP nonce and move `script-src` to `script-src 'self' 'nonce-<generated>'`.
- Use nonces on the inline scripts Next.js emits. This is explicitly scheduled in `STATUS.md` item 7.

