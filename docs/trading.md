# Trading, scopes, and money safety

This project is an unofficial eToro integration. Nothing here is investment advice. Trading can carry substantial risk; real-money actions can lose funds.

## Default behavior

No toolsets are enabled by default. The demo-safe example documented in the README quick look enables:
- `market-data`: stock/instrument search, metadata, candles, historical closes, and bid/ask rates.
- current `trading-demo` operations: demo portfolio reads plus demo order placement, cancellation, and position updates.

Demo operations change virtual state only. They can still place, close, and modify simulated positions and should be reviewed like any state-changing automation.

## Authentication

Use exactly one of:

```bash
ETORO_API_KEY=... ETORO_USER_KEY=...
```

or:

```bash
ETORO_ACCESS_TOKEN=...
```

Do not combine them. Do not use or share your eToro portal password.

OAuth scope requirements are alternatives, not a checklist. A tool's generated description and [tools.md](tools.md) list the alternatives; one alternative is sufficient. For the example setup, create demo-oriented API credentials through eToro's official API key management interface and avoid real-account permissions unless you explicitly need them.

## Asynchronous orders

A `202` result means eToro accepted an order for processing, not that it executed. For v3 orders:
1. Submit the order and retain the returned `requestId` and `orderId`.
2. Poll the corresponding demo or real order lookup operation.
3. Treat filled/partially-filled statuses as execution, rejected statuses as failures, and received/placed/waiting/pending statuses as still in flight.

Every tool result includes the generated or caller-supplied `x-request-id`. The server never automatically retries a potentially dispatched non-idempotent mutation. If a mutation fails ambiguously, check its outcome with the appropriate lookup operation before retrying with the same request ID.

## Real-money opt-in

Real-money mutation tools require **both**:
1. Selection of the relevant tool or toolset.
2. `ETORO_ALLOW_REAL_MONEY=true` (or `--allow-real-money`).

This includes live order placement/cancellation, live position changes, live copy-trading mutations, internal transfers, and reviewed v3 live-order endpoints whose upstream metadata does not flag them consistently.

Read-only real-account information does not itself require the real-money gate once its toolset is selected, but it can expose sensitive financial data. Keep those toolsets disabled unless needed.

MCP annotations such as `readOnlyHint` and `destructiveHint` are client hints. They do not replace human confirmation by your MCP client and are not authorization controls.

## Rate limits and polling

Generated tool descriptions include eToro's published rate-limit pools. Pools can be shared by many endpoints; calling one tool reduces the budget for the others in that pool.

The server:
- tracks shared pools locally per process;
- honors `Retry-After` and safe response headers;
- retries only read-only requests after network, 429, 502, 503, or 504 failures;
- never automatically retries state-changing requests after dispatch.

Use conservative polling intervals and stop if a tool reports that a pool is exhausted.
