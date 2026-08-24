export type ServiceHealth = {
  service: string;
  requests: number;
  errorRate: number;
  p95Ms: number;
  lastSeen: string;
  state: "healthy" | "degraded" | "critical";
};

export type TimelinePoint = {
  timestamp: string;
  requests: number;
  errors: number;
  p95Ms: number;
};

export type Investigation = {
  id: string;
  severity: "warning" | "critical";
  title: string;
  evidence: string;
  service: string;
  firstSeen: string;
};

export type Overview = {
  mode: "fixture" | "clickhouse";
  generatedAt: string;
  freshnessSeconds: number;
  summary: {
    requests: number;
    errorRate: number;
    p95Ms: number;
    services: number;
  };
  timeline: TimelinePoint[];
  services: ServiceHealth[];
  investigations: Investigation[];
};

export type TraceSummary = {
  traceId: string;
  timestamp: string;
  rootSpan: string;
  route: string;
  services: string[];
  durationMs: number;
  spanCount: number;
  status: "ok" | "error";
};

export type SpanRecord = {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  timestamp: string;
  spanName: string;
  serviceName: string;
  durationMs: number;
  status: "ok" | "error";
  statusMessage: string;
  attributes: Record<string, string>;
};

export type TraceDetail = {
  traceId: string;
  startedAt: string;
  durationMs: number;
  services: string[];
  status: "ok" | "error";
  spans: SpanRecord[];
};

export type LogRecord = {
  timestamp: string;
  traceId: string;
  spanId: string;
  severity: string;
  serviceName: string;
  body: string;
  attributes: Record<string, string>;
};

export type TraceFilters = {
  rangeMinutes?: number;
  limit?: number;
  service?: string;
  status?: "all" | "ok" | "error";
  search?: string;
};
