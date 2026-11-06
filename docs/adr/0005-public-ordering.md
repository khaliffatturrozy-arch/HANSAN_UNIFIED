# ADR 0005: Public ordering is unpaid and pay-at-counter

**Status:** Accepted

## Context

Online ordering without a payment provider can easily become misleading if the
UI implies payment was taken. Integrations for QRIS and cards are not part of this
slice.

## Decision

- Public orders accept pickup or dine-in only.
- Dine-in requires a table label; pickup rejects one.
- The API ignores the client timestamp and uses server time.
- Orders are created `unpaid`, with no payment row.
- The confirmation screen explicitly says to pay at the counter.
- Order creation is rate-limited by client IP.
- The public catalog is a reduced, public-safe shape.

## Consequences

- The product tells the truth about payment state.
- Kitchen tickets start without waiting for a payment integration.
- A future online payment flow must add provider idempotency, webhooks, and
  reconciliation rather than reusing the cash confirmation path.
- Public outlet selection is deterministic but limited to one outlet per tenant
  in this release.
