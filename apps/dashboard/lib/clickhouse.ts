import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { clampLimit, clampRange, safeSearch } from "./limits";
import {
  logsQuery,
  overviewTimelineQuery,
  serviceHealthQuery,
  traceDetailQuery,
  traceListQuery,
} from "./queries";
import type {
  LogRecord,
  Overview,
  ServiceHealth,
  SpanRecord,
  TimelinePoint,
  TraceDetail,
  TraceFilters,
  TraceSummary,
} from "./types";

let client: ClickHouseClient | undefined;

function getClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
      username: process.env.CLICKHOUSE_USER ?? "otel",
      password: process.env.CLICKHOUSE_PASSWORD ?? "otel",
      database: process.env.CLICKHOUSE_DATABASE ?? "telemetry",
      application: "telemetry-workbench-dashboard",
      request_timeout: 8_000,
    });
  }
  return client;
}

async function rows<T>(query: string, queryParams: Record<string, unknown>): Promise<T[]> {
  const result = await getClient().query({
    query,
    format: "JSONEachRow",
    query_params: queryParams,
    clickhouse_settings: {
      max_execution_time: 5,
      max_result_rows: "2000",
      result_overflow_mode: "break",
      readonly: "1",
    },
  });
  return result.json<T>();
}

type TimelineRow = { bucket: string; requests: string; errors: string; p95_ms: number };
type ServiceRow = { service: string; requests: string; error_rate: number; p95_ms: number; last_seen: string };
type TraceRow = { trace_id: string; timestamp: string; root_span: string; route: string; services: string[]; duration_ms: number; span_count: string; status: "ok" | "error" };
type SpanRow = { trace_id: string; span_id: string; parent_span_id: string; timestamp: string; span_name: string; service_name: string; duration_ms: number; status: "ok" | "error"; status_message: string; attributes: Record<string, string> };
type LogRow = { timestamp: string; trace_id: string; span_id: string; severity: string; service_name: string; body: string; attributes: Record<string, string> };

function serviceState(errorRate: number, p95Ms: number): ServiceHealth["state"] {
  if (errorRate >= 2 || p95Ms >= 750) return "critical";
  if (errorRate >= 0.8 || p95Ms >= 400) return "degraded";
  return "healthy";
}

export async function clickhouseOverview(requestedRange?: number): Promise<Overview> {
  const rangeMinutes = clampRange(requestedRange);
  const [timelineRows, serviceRows] = await Promise.all([
    rows<TimelineRow>(overviewTimelineQuery, { rangeMinutes }),
    rows<ServiceRow>(serviceHealthQuery, { rangeMinutes }),
  ]);

  const timeline: TimelinePoint[] = timelineRows.map((row) => ({
    timestamp: row.bucket,
    requests: Number(row.requests),
    errors: Number(row.errors),
    p95Ms: Number(row.p95_ms),
  }));
  const services: ServiceHealth[] = serviceRows.map((row) => {
    const errorRate = Number(row.error_rate) * 100;
    const p95Ms = Number(row.p95_ms);
    return {
      service: row.service,
      requests: Number(row.requests),
      errorRate,
      p95Ms,
      lastSeen: row.last_seen,
      state: serviceState(errorRate, p95Ms),
    };
  });

  const requests = timeline.reduce((sum, point) => sum + point.requests, 0);
  const errors = timeline.reduce((sum, point) => sum + point.errors, 0);
  const newest = services.length
    ? Math.max(...services.map((service) => new Date(service.lastSeen).getTime()))
    : 0;
  const investigations = services
    .filter((service) => service.state !== "healthy")
    .slice(0, 3)
    .map((service) => ({
      id: `service-${service.service}`,
      severity: service.state === "critical" ? ("critical" as const) : ("warning" as const),
      title: `${service.service} is outside its working health envelope`,
      evidence: `${service.errorRate.toFixed(1)}% errors and ${Math.round(service.p95Ms)} ms p95 in the selected window.`,
      service: service.service,
      firstSeen: service.lastSeen,
    }));

  return {
    mode: "clickhouse",
    generatedAt: new Date().toISOString(),
    freshnessSeconds: newest ? Math.max(0, Math.round((Date.now() - newest) / 1000)) : rangeMinutes * 60,
    summary: {
      requests,
      errorRate: requests ? (errors / requests) * 100 : 0,
      p95Ms: timeline.length ? Math.max(...timeline.map((point) => point.p95Ms)) : 0,
      services: services.length,
    },
    timeline,
    services,
    investigations,
  };
}

export async function clickhouseTraces(filters: TraceFilters): Promise<TraceSummary[]> {
  const traceRows = await rows<TraceRow>(traceListQuery, {
    rangeMinutes: clampRange(filters.rangeMinutes),
    limit: clampLimit(filters.limit),
    service: filters.service ?? "",
    status: filters.status ?? "all",
    search: safeSearch(filters.search),
  });
  return traceRows.map((row) => ({
    traceId: row.trace_id,
    timestamp: row.timestamp,
    rootSpan: row.root_span,
    route: row.route,
    services: row.services,
    durationMs: Number(row.duration_ms),
    spanCount: Number(row.span_count),
    status: row.status,
  }));
}

export async function clickhouseTrace(traceId: string): Promise<TraceDetail | null> {
  if (!/^[a-f0-9]{16,32}$/i.test(traceId)) return null;
  const spanRows = await rows<SpanRow>(traceDetailQuery, { traceId });
  if (!spanRows.length) return null;
  const spans: SpanRecord[] = spanRows.map((row) => ({
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    timestamp: row.timestamp,
    spanName: row.span_name,
    serviceName: row.service_name,
    durationMs: Number(row.duration_ms),
    status: row.status,
    statusMessage: row.status_message,
    attributes: row.attributes,
  }));
  const root = spans.find((span) => !span.parentSpanId) ?? spans[0];
  return {
    traceId,
    startedAt: spans[0].timestamp,
    durationMs: root.durationMs,
    services: [...new Set(spans.map((span) => span.serviceName))],
    status: spans.some((span) => span.status === "error") ? "error" : "ok",
    spans,
  };
}

export async function clickhouseLogs(filters: TraceFilters & { traceId?: string }): Promise<LogRecord[]> {
  const logRows = await rows<LogRow>(logsQuery, {
    rangeMinutes: clampRange(filters.rangeMinutes),
    limit: clampLimit(filters.limit),
    traceId: filters.traceId ?? "",
    service: filters.service ?? "",
    search: safeSearch(filters.search),
  });
  return logRows.map((row) => ({
    timestamp: row.timestamp,
    traceId: row.trace_id,
    spanId: row.span_id,
    severity: row.severity,
    serviceName: row.service_name,
    body: row.body,
    attributes: row.attributes,
  }));
}
