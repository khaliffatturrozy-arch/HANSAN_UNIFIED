# ADR 0002: Offline-first POS with idempotent sync

**Status:** Accepted

## Context

Counter service cannot stop when the network drops. Online-only POS is not
acceptable for the target market. Retrying HTTP requests without a stable key can
duplicate sales and payments.

## Decision

- Persist a queue row in IndexedDB before showing the receipt.
- Generate a UUID on the device and make `(tenant_id, client_order_id)` unique.
- Send queue batches with device time, catalog version, and expected total.
- Re-price on the server from the current catalog.
- Return accepted, duplicate, price conflict, or rejected per row.
- Preserve conflicts and rejects for human review; prune only synced rows.
- Restrict offline payment to cash.

## Consequences

- A sale cannot be lost to a refresh after the durable write succeeds.
- Duplicate sync is safe across network ambiguity.
- A price change is visible instead of silently altering the customer's charge.
- The client queue is device-local and cannot be recovered from server backups.
- QRIS/EDC need provider-side idempotency and cannot be bolted on casually.
