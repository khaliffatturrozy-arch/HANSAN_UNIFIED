# ADR 0003: Server-side sessions, scrypt, and CSRF tokens

**Status:** Accepted

## Context

The platform stores tenant financial and staff data. JWTs kept only in the
browser make immediate revocation and permission re-checking harder. Public
internet exposure requires brute-force resistance and CSRF defence.

## Decision

- Hash passwords with scrypt and a per-password salt.
- Store random session and CSRF tokens as SHA-256 hashes in PostgreSQL.
- Put the session token in an HttpOnly SameSite=Lax cookie.
- Send the CSRF token in a readable same-site cookie and require it in an
  `x-csrf-token` header for mutations.
- Re-check user, tenant, outlet, role, and grants on every resolution.
- Revoke by marking the session row, not by relying on expiry alone.

## Consequences

- Logout and permission changes take effect immediately.
- A database leak does not expose raw session tokens.
- Browser JavaScript can read the CSRF cookie, but cannot read the session cookie.
- Every mutation path must remember to call the CSRF guard; tests and review must
  enforce that convention.
