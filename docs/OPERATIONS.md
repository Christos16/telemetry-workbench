# Operating the local stack

## Start

```bash
cp .env.example .env
npm install
npm run infra:up
DATA_MODE=clickhouse npm run dev
```

The dashboard runs on `http://localhost:3000`, the instrumented checkout API on
`http://localhost:4000`, OTLP/HTTP on `http://localhost:4318`, and ClickHouse
HTTP on `http://localhost:8123`.

## Generate representative traffic

Use the three controls in the dashboard or call the demo service directly:

```bash
curl -X POST http://localhost:4000/api/checkout \
  -H 'content-type: application/json' \
  -d '{"mode":"healthy","amount":12900}'

curl -X POST http://localhost:4000/api/checkout \
  -H 'content-type: application/json' \
  -d '{"mode":"slow","amount":12900}'

curl -X POST http://localhost:4000/api/checkout \
  -H 'content-type: application/json' \
  -d '{"mode":"failed","amount":12900}'
```

Allow two to five seconds for the Collector's demo batch to flush.

## Failure drill: ClickHouse unavailable

Stop only ClickHouse, generate traffic, and inspect Collector queue metrics:

```bash
docker compose -f infra/compose.yml stop clickhouse
curl http://localhost:8888/metrics | grep otelcol_exporter_queue
docker compose -f infra/compose.yml start clickhouse
```

The queue is disk-backed, retries are bounded, and the dashboard reports data
freshness. In production, alert on queue age and capacity well before the disk
or upstream retry window is exhausted.

## Security notes

- The dashboard's ClickHouse user should be read-only outside this demo.
- Collector redaction is defense in depth; applications should avoid emitting
  secrets in the first place.
- Trace attributes are untrusted input. Never concatenate them into SQL.
- Any future LLM investigation feature should receive bounded evidence and a
  typed tool surface—not raw database credentials.
