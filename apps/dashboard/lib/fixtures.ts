import type {
  Investigation,
  LogRecord,
  Overview,
  ServiceHealth,
  SpanRecord,
  TimelinePoint,
  TraceDetail,
  TraceFilters,
  TraceSummary,
} from "./types";

const services: ServiceHealth[] = [
  { service: "checkout-api", requests: 1842, errorRate: 2.8, p95Ms: 684, lastSeen: new Date().toISOString(), state: "critical" },
  { service: "payment-adapter", requests: 1621, errorRate: 1.9, p95Ms: 512, lastSeen: new Date().toISOString(), state: "degraded" },
  { service: "catalog-api", requests: 2934, errorRate: 0.2, p95Ms: 118, lastSeen: new Date().toISOString(), state: "healthy" },
];

function timeAgo(minutes: number, seconds = 0): string {
  return new Date(Date.now() - minutes * 60_000 - seconds * 1000).toISOString();
}

function makeTimeline(rangeMinutes: number): TimelinePoint[] {
  const points = Math.min(36, Math.max(12, Math.round(rangeMinutes / 5)));
  return Array.from({ length: points }, (_, index) => {
    const position = index / Math.max(1, points - 1);
    const spike = Math.exp(-Math.pow((position - 0.72) * 8, 2));
    return {
      timestamp: timeAgo((points - index) * (rangeMinutes / points)),
      requests: Math.round(90 + 24 * Math.sin(index / 2.1) + spike * 72),
      errors: Math.max(0, Math.round(1 + spike * 15 + (index % 7 === 0 ? 2 : 0))),
      p95Ms: Math.round(185 + 35 * Math.cos(index / 2.8) + spike * 610),
    };
  });
}

const traces: TraceSummary[] = [
  { traceId: "91b2f9a0e7df4d9cbe4f30dc41f735a1", timestamp: timeAgo(1, 14), rootSpan: "POST /api/checkout", route: "/api/checkout", services: ["checkout-api", "payment-adapter"], durationMs: 1284, spanCount: 6, status: "error" },
  { traceId: "5c86b1e5d1bb43e3a31c19fb460a1062", timestamp: timeAgo(2, 2), rootSpan: "POST /api/checkout", route: "/api/checkout", services: ["checkout-api", "payment-adapter"], durationMs: 842, spanCount: 7, status: "ok" },
  { traceId: "3ab14cc7b74f485c93782f5fd738d3b9", timestamp: timeAgo(3, 28), rootSpan: "GET /api/catalog", route: "/api/catalog", services: ["catalog-api"], durationMs: 96, spanCount: 3, status: "ok" },
  { traceId: "a70762a1474c44e9b04b9ab24c2946a8", timestamp: timeAgo(5, 3), rootSpan: "POST /api/checkout", route: "/api/checkout", services: ["checkout-api", "payment-adapter"], durationMs: 963, spanCount: 6, status: "error" },
  { traceId: "28e5220a31764a87bf61fd0010ead7d0", timestamp: timeAgo(7, 41), rootSpan: "GET /api/catalog", route: "/api/catalog", services: ["catalog-api"], durationMs: 132, spanCount: 4, status: "ok" },
  { traceId: "c603655ac78d48a1ad76abc5993b00d0", timestamp: timeAgo(9, 5), rootSpan: "POST /api/checkout", route: "/api/checkout", services: ["checkout-api", "payment-adapter"], durationMs: 734, spanCount: 6, status: "ok" },
];

const baseSpans: SpanRecord[] = [
  { traceId: traces[0].traceId, spanId: "70c6472319cd768a", parentSpanId: "", timestamp: traces[0].timestamp, spanName: "POST /api/checkout", serviceName: "checkout-api", durationMs: 1284, status: "error", statusMessage: "Payment provider rejected the charge", attributes: { "http.route": "/api/checkout", "http.request.method": "POST", "http.response.status_code": "502", "checkout.mode": "failed" } },
  { traceId: traces[0].traceId, spanId: "99174f778214cc32", parentSpanId: "70c6472319cd768a", timestamp: new Date(new Date(traces[0].timestamp).getTime() + 22).toISOString(), spanName: "validate cart", serviceName: "checkout-api", durationMs: 38, status: "ok", statusMessage: "", attributes: { "cart.items": "3" } },
  { traceId: traces[0].traceId, spanId: "39f0622022034b8f", parentSpanId: "70c6472319cd768a", timestamp: new Date(new Date(traces[0].timestamp).getTime() + 78).toISOString(), spanName: "reserve inventory", serviceName: "checkout-api", durationMs: 164, status: "ok", statusMessage: "", attributes: { "db.system": "postgresql" } },
  { traceId: traces[0].traceId, spanId: "76c90b573cf259af", parentSpanId: "70c6472319cd768a", timestamp: new Date(new Date(traces[0].timestamp).getTime() + 258).toISOString(), spanName: "charge payment", serviceName: "payment-adapter", durationMs: 911, status: "error", statusMessage: "provider_timeout", attributes: { "server.address": "payments.example.test", "retry.attempt": "2" } },
  { traceId: traces[0].traceId, spanId: "d4d880560e1295ba", parentSpanId: "76c90b573cf259af", timestamp: new Date(new Date(traces[0].timestamp).getTime() + 273).toISOString(), spanName: "POST /charges", serviceName: "payment-adapter", durationMs: 879, status: "error", statusMessage: "HTTP 504", attributes: { "http.response.status_code": "504", "network.protocol.version": "1.1" } },
  { traceId: traces[0].traceId, spanId: "c08b59b15cda4e86", parentSpanId: "70c6472319cd768a", timestamp: new Date(new Date(traces[0].timestamp).getTime() + 1190).toISOString(), spanName: "release inventory", serviceName: "checkout-api", durationMs: 71, status: "ok", statusMessage: "", attributes: { "compensation.reason": "payment_failed" } },
];

const fixtureLogs: LogRecord[] = [
  { timestamp: timeAgo(1, 13), traceId: traces[0].traceId, spanId: "76c90b573cf259af", severity: "ERROR", serviceName: "payment-adapter", body: "Provider timed out after the charge request was accepted", attributes: { attempt: "2", outcome: "unknown" } },
  { timestamp: timeAgo(1, 12), traceId: traces[0].traceId, spanId: "70c6472319cd768a", severity: "WARN", serviceName: "checkout-api", body: "Checkout moved to payment_reconciliation instead of blind retry", attributes: { state: "payment_reconciliation" } },
  { timestamp: timeAgo(2, 1), traceId: traces[1].traceId, spanId: "fbdff90a38f17e60", severity: "INFO", serviceName: "checkout-api", body: "Checkout completed", attributes: { amount: "12900", currency: "EUR" } },
  { timestamp: timeAgo(3, 27), traceId: traces[2].traceId, spanId: "a73b2aa87f8ccbb2", severity: "INFO", serviceName: "catalog-api", body: "Catalog response served from cache", attributes: { cache: "hit" } },
];

const investigations: Investigation[] = [
  { id: "payment-tail", severity: "critical", title: "Payment latency is driving checkout failures", evidence: "p95 reached 684 ms and 2.8% of checkout requests failed in the selected window.", service: "checkout-api", firstSeen: timeAgo(18) },
  { id: "provider-504", severity: "warning", title: "Provider 504s are concentrated in one dependency", evidence: "The slowest error traces converge on payment-adapter → POST /charges.", service: "payment-adapter", firstSeen: timeAgo(13) },
];

export function fixtureOverview(rangeMinutes: number): Overview {
  const timeline = makeTimeline(rangeMinutes);
  const requests = timeline.reduce((sum, point) => sum + point.requests, 0);
  const errors = timeline.reduce((sum, point) => sum + point.errors, 0);
  return {
    mode: "fixture",
    generatedAt: new Date().toISOString(),
    freshnessSeconds: 3,
    summary: { requests, errorRate: (errors / requests) * 100, p95Ms: Math.max(...timeline.map((point) => point.p95Ms)), services: services.length },
    timeline,
    services,
    investigations,
  };
}

export function fixtureTraces(filters: TraceFilters): TraceSummary[] {
  return traces.filter((trace) => {
    if (filters.service && !trace.services.includes(filters.service)) return false;
    if (filters.status && filters.status !== "all" && trace.status !== filters.status) return false;
    if (filters.search) {
      const query = filters.search.toLowerCase();
      if (!`${trace.traceId} ${trace.rootSpan} ${trace.route}`.toLowerCase().includes(query)) return false;
    }
    return true;
  }).slice(0, filters.limit ?? 50);
}

export function fixtureTrace(traceId: string): TraceDetail | null {
  const summary = traces.find((trace) => trace.traceId === traceId);
  if (!summary) return null;
  const spans = traceId === traces[0].traceId
    ? baseSpans
    : baseSpans.map((span, index) => ({ ...span, traceId, spanId: `${span.spanId.slice(0, -2)}${index.toString().padStart(2, "0")}`, timestamp: new Date(new Date(summary.timestamp).getTime() + index * 42).toISOString(), status: summary.status }));
  return { traceId, startedAt: summary.timestamp, durationMs: summary.durationMs, services: summary.services, status: summary.status, spans };
}

export function fixtureLogRecords(filters: TraceFilters & { traceId?: string }): LogRecord[] {
  return fixtureLogs.filter((log) => {
    if (filters.traceId && log.traceId !== filters.traceId) return false;
    if (filters.service && log.serviceName !== filters.service) return false;
    if (filters.search && !log.body.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  }).slice(0, filters.limit ?? 50);
}
