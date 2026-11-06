# ADR 0004: PostgreSQL authoritative, PGlite for local and tests

**Status:** Accepted

## Context

The delivery environment has no local PostgreSQL server or Docker, but production
requires real PostgreSQL behavior. Mocking Drizzle would weaken isolation and
transaction tests.

## Decision

- Use standard PostgreSQL as the production authority.
- Use PGlite, an embedded PostgreSQL build, for local development and tests,
  executing the same SQL migrations and Drizzle schema.
- Keep both drivers behind one `AppDb` port.
- Refuse PGlite in production unless explicitly opted in for a single node.
- Ship a PostgreSQL Compose topology and production migration runner.

## Consequences

- Local workflows need no external service.
- Integration tests exercise real SQL constraints, not mocks.
- PGlite cannot validate networking, failover, or production concurrency.
- A staging run against managed PostgreSQL remains a release gate.
