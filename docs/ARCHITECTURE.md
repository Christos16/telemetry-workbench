# Architecture

Telemetry Workbench is intentionally small, but the data path follows the same
boundaries a production observability system needs.

```text
instrumented services
        |
        | OTLP/HTTP or OTLP/gRPC
        v
OpenTelemetry Collector
  - memory limits
  - resource normalization
  - sensitive-attribute redaction
  - durable exporter queue
  - retry with bounded backoff
        |
        | batched native inserts
        v
ClickHouse
  - append-heavy signal tables
  - time/service-oriented sort keys
  - 72-hour demo retention
        |
        | tenant-safe, time-bounded queries
        v
Next.js investigation UI
  - RED service health
  - trace explorer and span waterfall
  - trace-correlated logs
  - ingest freshness surfaced to the operator
```

## Decisions that matter

### The Collector is the ingestion boundary

Applications export OTLP rather than knowing about ClickHouse. This keeps the
application portable and gives the pipeline one place for resource limits,
redaction, retries and batching. The local stack enables a disk-backed exporter
queue so a temporary ClickHouse outage does not immediately lose accepted work.

This is still not a replicated durability guarantee. A production deployment
would run multiple collectors, isolate queues per failure domain, and define
precisely whether an OTLP success means "received", "durably queued", or
"queryable". Those states should never be conflated.

### ClickHouse owns analytical telemetry, not product state

Spans and logs are append-heavy and queried through aggregations over bounded
time ranges. ClickHouse is a good fit for that workload. Team membership,
permissions, alert configuration and billing would belong in a transactional
control-plane store, not these tables.

### Queries have explicit budgets

The repository clamps time windows and row limits. Values are passed as query
parameters and selectable fields never come from a request. A production
version should also enforce per-tenant concurrency, scanned-byte and execution-
time budgets through a read-only ClickHouse role.

### Cross-signal correlation is a product feature

Trace and span identifiers are preserved on log records. The UI uses them to
move from a service-level symptom to one trace and then to the exact log context.
That is more useful than presenting three unrelated signal tabs.

## Deliberately out of scope

- authentication and multi-tenant membership
- a replicated stream before ClickHouse
- alert evaluation and notification delivery
- long-term object-storage retention
- tail sampling and adaptive telemetry budgets
- multi-region residency and failover

These are documented gaps, not hidden behind a "production-ready" claim.
