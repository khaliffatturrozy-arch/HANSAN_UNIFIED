# ADR 0001: Modular monolith on Next.js and PostgreSQL

**Status:** Accepted

## Context

HANSAN needs POS, KDS, HQ, and public ordering to share business rules. The
previous V2 application had useful domain code but a broken UI. A distributed
system would add operational cost before product-market fit.

## Decision

Build one Next.js deployable with explicit domain modules, Drizzle ORM, and a
single PostgreSQL authoritative database. Reuse proven domain patterns from V2,
not its UI code.

## Consequences

- One transaction boundary for orders, tickets, payments, and audit events.
- Shared money and RBAC implementations across all surfaces.
- A service extraction remains possible later because UI adapters do not own
  business rules.
- The team must preserve module boundaries by review; TypeScript does not enforce
  them.
