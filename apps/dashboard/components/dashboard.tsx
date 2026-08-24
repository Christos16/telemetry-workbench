"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LogRecord, Overview, TraceDetail, TraceSummary } from "@/lib/types";

type DashboardProps = {
  initialOverview: Overview;
  initialTraces: TraceSummary[];
  initialLogs: LogRecord[];
};

type View = "overview" | "traces" | "logs" | "pipeline";
type Status = "all" | "ok" | "error";

const rangeLabels: Record<number, string> = {
  15: "15 min",
  60: "1 hour",
  180: "3 hours",
  720: "12 hours",
  1440: "24 hours",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: value > 9_999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatRelative(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function MetricCard({ label, value, unit, note, tone = "neutral" }: { label: string; value: string; unit?: string; note: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}<span>{unit}</span></div>
      <div className="metric-note">{note}</div>
    </article>
  );
}

function StatusDot({ state }: { state: "healthy" | "degraded" | "critical" }) {
  return <span className={`status-dot status-${state}`} aria-label={state} />;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Dashboard({ initialOverview, initialTraces, initialLogs }: DashboardProps) {
  const [view, setView] = useState<View>("overview");
  const [range, setRange] = useState(60);
  const [overview, setOverview] = useState(initialOverview);
  const [traces, setTraces] = useState(initialTraces);
  const [logs, setLogs] = useState(initialLogs);
  const [service, setService] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState("");
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [selectedLogs, setSelectedLogs] = useState<LogRecord[]>([]);
  const [demoState, setDemoState] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ range: String(range), limit: "50", status });
    if (service) params.set("service", service);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [range, search, service, status]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLastError("");
    try {
      const [overviewResponse, tracesResponse, logsResponse] = await Promise.all([
        fetch(`/api/overview?range=${range}`, { cache: "no-store" }),
        fetch(`/api/traces?${queryString}`, { cache: "no-store" }),
        fetch(`/api/logs?${queryString}`, { cache: "no-store" }),
      ]);
      if (!overviewResponse.ok || !tracesResponse.ok || !logsResponse.ok) throw new Error("The telemetry query did not complete.");
      setOverview(await overviewResponse.json() as Overview);
      setTraces(await tracesResponse.json() as TraceSummary[]);
      setLogs(await logsResponse.json() as LogRecord[]);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Unable to refresh telemetry.");
    } finally {
      setLoading(false);
    }
  }, [queryString, range]);

  useEffect(() => {
    const debounce = window.setTimeout(() => void loadData(), 250);
    return () => window.clearTimeout(debounce);
  }, [loadData]);

  async function openTrace(traceId: string) {
    setSelectedTrace(null);
    setSelectedLogs([]);
    const [traceResponse, logsResponse] = await Promise.all([
      fetch(`/api/traces/${traceId}`, { cache: "no-store" }),
      fetch(`/api/logs?traceId=${traceId}&range=${range}&limit=100`, { cache: "no-store" }),
    ]);
    if (traceResponse.ok) setSelectedTrace(await traceResponse.json() as TraceDetail);
    if (logsResponse.ok) setSelectedLogs(await logsResponse.json() as LogRecord[]);
  }

  async function generateTraffic(mode: "healthy" | "slow" | "failed") {
    setDemoState(`Sending ${mode} checkout…`);
    const response = await fetch("/api/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (response.ok) {
      setDemoState("Trace accepted. Waiting for the Collector batch…");
      window.setTimeout(() => void loadData(), 2_500);
    } else {
      setDemoState(overview.mode === "fixture" ? "Start the demo service to generate live telemetry." : "The demo service is unavailable.");
    }
  }

  const chartData = overview.timeline.map((point) => ({
    ...point,
    label: formatTime(point.timestamp),
  }));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>Telemetry<br /><strong>Workbench</strong></span>
        </div>

        <nav aria-label="Primary navigation">
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span>⌁</span> Overview</button>
          <button className={view === "traces" ? "active" : ""} onClick={() => setView("traces")}><span>⤧</span> Traces</button>
          <button className={view === "logs" ? "active" : ""} onClick={() => setView("logs")}><span>≡</span> Logs</button>
          <button className={view === "pipeline" ? "active" : ""} onClick={() => setView("pipeline")}><span>◇</span> Pipeline</button>
        </nav>

        <div className="sidebar-foot">
          <div className="mode-chip"><span className="pulse" />{overview.mode === "fixture" ? "Fixture mode" : "ClickHouse live"}</div>
          <p>OpenTelemetry → Collector → ClickHouse</p>
          <a href="https://github.com/Christos16/telemetry-workbench" target="_blank" rel="noreferrer">View source ↗</a>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">Production / local</div>
            <h1>{view === "overview" ? "Service health" : view === "traces" ? "Trace explorer" : view === "logs" ? "Log stream" : "Telemetry pipeline"}</h1>
          </div>
          <div className="topbar-actions">
            <label className="range-select">
              <span>Window</span>
              <select value={range} onChange={(event) => setRange(Number(event.target.value))}>
                {Object.entries(rangeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className="refresh" onClick={() => void loadData()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>

        {lastError && <div className="error-banner">{lastError}</div>}

        {view === "overview" && (
          <>
            <section className="metric-grid" aria-label="Key telemetry">
              <MetricCard label="Requests" value={formatNumber(overview.summary.requests)} note={`${rangeLabels[range]} total`} />
              <MetricCard label="Error rate" value={overview.summary.errorRate.toFixed(2)} unit="%" note={overview.summary.errorRate > 1 ? "Above 1% working threshold" : "Inside working threshold"} tone={overview.summary.errorRate > 1 ? "bad" : "good"} />
              <MetricCard label="p95 latency" value={Math.round(overview.summary.p95Ms).toString()} unit="ms" note="Tail latency, not the average" tone={overview.summary.p95Ms > 500 ? "bad" : "neutral"} />
              <MetricCard label="Freshness" value={overview.freshnessSeconds.toString()} unit="s" note={`${overview.summary.services} services reporting`} tone={overview.freshnessSeconds > 30 ? "bad" : "good"} />
            </section>

            <section className="content-grid">
              <article className="panel chart-panel">
                <div className="panel-heading">
                  <div><span className="kicker">Request health</span><h2>Traffic, errors and tail latency</h2></div>
                  <div className="legend"><span><i className="legend-requests" /> Requests</span><span><i className="legend-errors" /> Errors</span><span><i className="legend-latency" /> p95</span></div>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 12, right: 6, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="requestFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.24} /><stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid stroke="#27303a" strokeDasharray="3 5" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={45} />
                      <YAxis yAxisId="requests" tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="latency" orientation="right" tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: "#111820", border: "1px solid #2b3541", borderRadius: 10, fontSize: 12 }} />
                      <Area yAxisId="requests" type="monotone" dataKey="requests" stroke="#6ee7b7" fill="url(#requestFill)" strokeWidth={2} />
                      <Bar yAxisId="requests" dataKey="errors" fill="#fb7185" radius={[3, 3, 0, 0]} maxBarSize={8} />
                      <Area yAxisId="latency" type="monotone" dataKey="p95Ms" stroke="#a78bfa" fill="transparent" strokeWidth={1.5} strokeDasharray="5 4" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="panel investigations-panel">
                <div className="panel-heading"><div><span className="kicker">Evidence first</span><h2>Investigations</h2></div></div>
                <div className="investigation-list">
                  {overview.investigations.length ? overview.investigations.map((item) => (
                    <button key={item.id} onClick={() => { setService(item.service); setStatus("error"); setView("traces"); }}>
                      <span className={`severity severity-${item.severity}`}>{item.severity}</span>
                      <strong>{item.title}</strong>
                      <p>{item.evidence}</p>
                      <small>{item.service} · {formatRelative(item.firstSeen)}</small>
                    </button>
                  )) : <EmptyState>No service is outside the current working thresholds.</EmptyState>}
                </div>
              </article>
            </section>

            <section className="content-grid lower-grid">
              <article className="panel">
                <div className="panel-heading"><div><span className="kicker">RED by service</span><h2>Where to look first</h2></div><button className="text-button" onClick={() => setView("traces")}>Open traces →</button></div>
                <div className="service-table table">
                  <div className="table-head"><span>Service</span><span>Requests</span><span>Errors</span><span>p95</span><span>Last seen</span></div>
                  {overview.services.map((item) => (
                    <button className="table-row" key={item.service} onClick={() => { setService(item.service); setView("traces"); }}>
                      <span className="service-name"><StatusDot state={item.state} />{item.service}</span>
                      <span>{formatNumber(item.requests)}</span><span className={item.errorRate > 1 ? "bad-value" : ""}>{item.errorRate.toFixed(2)}%</span><span>{Math.round(item.p95Ms)} ms</span><span>{formatRelative(item.lastSeen)}</span>
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel demo-panel">
                <div className="panel-heading"><div><span className="kicker">Instrumented workload</span><h2>Generate a checkout trace</h2></div></div>
                <p>Exercise the same route with three production behaviours. The service emits traces, metrics and trace-correlated logs through OTLP.</p>
                <div className="demo-actions">
                  <button onClick={() => void generateTraffic("healthy")}><span className="action-dot healthy" /> Healthy</button>
                  <button onClick={() => void generateTraffic("slow")}><span className="action-dot degraded" /> Slow provider</button>
                  <button onClick={() => void generateTraffic("failed")}><span className="action-dot critical" /> Failed payment</button>
                </div>
                <small>{demoState || (overview.mode === "fixture" ? "The dashboard is using deterministic fixtures; start the stack for live traces." : "Collector flushes partial demo batches every two seconds.")}</small>
              </article>
            </section>
          </>
        )}

        {view === "traces" && (
          <TraceExplorer traces={traces} services={overview.services.map((item) => item.service)} service={service} setService={setService} status={status} setStatus={setStatus} search={search} setSearch={setSearch} onOpen={(traceId) => void openTrace(traceId)} />
        )}

        {view === "logs" && <LogStream logs={logs} search={search} setSearch={setSearch} />}
        {view === "pipeline" && <Pipeline mode={overview.mode} freshness={overview.freshnessSeconds} />}
      </main>

      {selectedTrace && <TraceDrawer trace={selectedTrace} logs={selectedLogs} onClose={() => setSelectedTrace(null)} />}
    </div>
  );
}

function TraceExplorer({ traces, services, service, setService, status, setStatus, search, setSearch, onOpen }: { traces: TraceSummary[]; services: string[]; service: string; setService: (value: string) => void; status: Status; setStatus: (value: Status) => void; search: string; setSearch: (value: string) => void; onOpen: (traceId: string) => void }) {
  return (
    <section className="panel explorer-panel">
      <div className="filter-bar">
        <label className="search-field"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search span or trace ID" /></label>
        <select value={service} onChange={(event) => setService(event.target.value)}><option value="">All services</option>{services.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value as Status)}><option value="all">Any status</option><option value="error">Errors</option><option value="ok">Successful</option></select>
        <span className="result-count">{traces.length} traces</span>
      </div>
      <div className="trace-table table">
        <div className="table-head"><span>Started</span><span>Root span</span><span>Services</span><span>Duration</span><span>Spans</span><span>Status</span></div>
        {traces.map((trace) => (
          <button className="table-row" key={trace.traceId} onClick={() => onOpen(trace.traceId)}>
            <span><strong>{formatTime(trace.timestamp)}</strong><small>{trace.traceId.slice(0, 12)}</small></span>
            <span><strong>{trace.rootSpan}</strong><small>{trace.route}</small></span>
            <span className="service-pills">{trace.services.map((item) => <i key={item}>{item}</i>)}</span>
            <span className={trace.durationMs > 750 ? "bad-value" : ""}>{Math.round(trace.durationMs)} ms</span><span>{trace.spanCount}</span><span><i className={`status-pill trace-${trace.status}`}>{trace.status}</i></span>
          </button>
        ))}
        {!traces.length && <EmptyState>No traces match these filters.</EmptyState>}
      </div>
    </section>
  );
}

function LogStream({ logs, search, setSearch }: { logs: LogRecord[]; search: string; setSearch: (value: string) => void }) {
  return (
    <section className="panel log-panel">
      <div className="filter-bar"><label className="search-field"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search log body" /></label><span className="result-count">{logs.length} records</span></div>
      <div className="log-stream">
        {logs.map((log, index) => <div className="log-line" key={`${log.traceId}-${log.spanId}-${index}`}><time>{formatTime(log.timestamp)}</time><span className={`log-level log-${log.severity.toLowerCase()}`}>{log.severity || "INFO"}</span><strong>{log.serviceName}</strong><p>{log.body}</p><code>{log.traceId.slice(0, 10)}</code></div>)}
        {!logs.length && <EmptyState>No logs match these filters.</EmptyState>}
      </div>
    </section>
  );
}

function Pipeline({ mode, freshness }: { mode: Overview["mode"]; freshness: number }) {
  const stages = [
    { number: "01", title: "Instrument", detail: "Node SDK, auto-instrumentation and explicit business spans preserve trace context." },
    { number: "02", title: "Receive", detail: "The Collector accepts OTLP over HTTP or gRPC and applies memory limits." },
    { number: "03", title: "Govern", detail: "Resources are normalized, sensitive attributes are removed and retries are queued on disk." },
    { number: "04", title: "Store", detail: "Batched inserts land in ClickHouse tables ordered for service and time-range investigations." },
    { number: "05", title: "Investigate", detail: "Bounded read-only queries connect service health, traces and logs without hiding freshness." },
  ];
  return (
    <section className="pipeline-view">
      <div className="pipeline-intro"><span className="kicker">Data path</span><h2>From one request to useful evidence</h2><p>This is a small deployment, but the failure boundaries are explicit. The Collector owns transport concerns; ClickHouse owns analytical telemetry; the product owns the investigation workflow.</p></div>
      <div className="pipeline-stages">{stages.map((stage) => <article key={stage.number}><span>{stage.number}</span><div><h3>{stage.title}</h3><p>{stage.detail}</p></div></article>)}</div>
      <div className="pipeline-facts"><div><small>Current mode</small><strong>{mode === "fixture" ? "Deterministic fixture" : "Live ClickHouse"}</strong></div><div><small>Ingest freshness</small><strong>{freshness}s</strong></div><div><small>Demo retention</small><strong>72 hours</strong></div><div><small>Delivery model</small><strong>At least once</strong></div></div>
    </section>
  );
}

function TraceDrawer({ trace, logs, onClose }: { trace: TraceDetail; logs: LogRecord[]; onClose: () => void }) {
  const traceStart = new Date(trace.startedAt).getTime();
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="trace-drawer">
        <header><div><span className={`status-pill trace-${trace.status}`}>{trace.status}</span><h2>{trace.spans.find((span) => !span.parentSpanId)?.spanName ?? "Trace detail"}</h2><code>{trace.traceId}</code></div><button onClick={onClose} aria-label="Close trace detail">×</button></header>
        <div className="trace-summary"><span><small>Duration</small><strong>{Math.round(trace.durationMs)} ms</strong></span><span><small>Spans</small><strong>{trace.spans.length}</strong></span><span><small>Services</small><strong>{trace.services.length}</strong></span><span><small>Started</small><strong>{formatTime(trace.startedAt)}</strong></span></div>
        <section className="waterfall"><div className="drawer-section-heading"><h3>Span waterfall</h3><span>0 ms <i /> {Math.round(trace.durationMs)} ms</span></div>{trace.spans.map((span) => {
          const offset = Math.max(0, new Date(span.timestamp).getTime() - traceStart);
          return <article key={span.spanId}><div className="span-meta" style={{ paddingLeft: span.parentSpanId ? 18 : 0 }}><strong>{span.spanName}</strong><small>{span.serviceName}</small></div><div className="span-track"><i className={`span-bar span-${span.status}`} style={{ left: `${Math.min(94, offset / Math.max(1, trace.durationMs) * 100)}%`, width: `${Math.max(2, Math.min(100 - offset / Math.max(1, trace.durationMs) * 100, span.durationMs / Math.max(1, trace.durationMs) * 100))}%` }} /><span>{Math.round(span.durationMs)} ms</span></div></article>;
        })}</section>
        <section className="correlated-logs"><div className="drawer-section-heading"><h3>Correlated logs</h3><span>{logs.length} records</span></div>{logs.map((log, index) => <article key={`${log.spanId}-${index}`}><time>{formatTime(log.timestamp)}</time><span className={`log-level log-${log.severity.toLowerCase()}`}>{log.severity}</span><div><strong>{log.serviceName}</strong><p>{log.body}</p></div></article>)}{!logs.length && <EmptyState>No logs carry this trace context.</EmptyState>}</section>
      </aside>
    </div>
  );
}
