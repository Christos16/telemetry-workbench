export const rootSpanPredicate =
  "(ParentSpanId = '' OR positionCaseInsensitive(SpanKind, 'server') > 0)";

export const overviewTimelineQuery = `
  SELECT
    toStartOfInterval(Timestamp, INTERVAL 5 minute) AS bucket,
    count() AS requests,
    countIf(positionCaseInsensitive(StatusCode, 'error') > 0) AS errors,
    quantileTDigest(0.95)(Duration) / 1000000 AS p95_ms
  FROM telemetry.otel_traces
  WHERE Timestamp >= now() - toIntervalMinute({rangeMinutes:UInt32})
    AND ${rootSpanPredicate}
  GROUP BY bucket
  ORDER BY bucket ASC
`;

export const serviceHealthQuery = `
  SELECT
    ServiceName AS service,
    count() AS requests,
    countIf(positionCaseInsensitive(StatusCode, 'error') > 0) / count() AS error_rate,
    quantileTDigest(0.95)(Duration) / 1000000 AS p95_ms,
    max(Timestamp) AS last_seen
  FROM telemetry.otel_traces
  WHERE Timestamp >= now() - toIntervalMinute({rangeMinutes:UInt32})
    AND ${rootSpanPredicate}
  GROUP BY ServiceName
  ORDER BY error_rate DESC, p95_ms DESC
`;

export const traceListQuery = `
  SELECT
    TraceId AS trace_id,
    min(Timestamp) AS timestamp,
    argMin(SpanName, Timestamp) AS root_span,
    coalesce(nullIf(argMin(SpanAttributes['http.route'], Timestamp), ''), argMin(SpanAttributes['url.path'], Timestamp), '/') AS route,
    groupUniqArray(ServiceName) AS services,
    greatest(maxIf(Duration, ParentSpanId = ''), max(Duration)) / 1000000 AS duration_ms,
    count() AS span_count,
    if(countIf(positionCaseInsensitive(StatusCode, 'error') > 0) > 0, 'error', 'ok') AS status
  FROM telemetry.otel_traces
  WHERE Timestamp >= now() - toIntervalMinute({rangeMinutes:UInt32})
    AND ({service:String} = '' OR ServiceName = {service:String})
    AND ({search:String} = '' OR positionCaseInsensitive(SpanName, {search:String}) > 0 OR positionCaseInsensitive(TraceId, {search:String}) > 0)
  GROUP BY TraceId
  HAVING ({status:String} = 'all' OR status = {status:String})
  ORDER BY timestamp DESC
  LIMIT {limit:UInt32}
`;

export const traceDetailQuery = `
  SELECT
    TraceId AS trace_id,
    SpanId AS span_id,
    ParentSpanId AS parent_span_id,
    Timestamp AS timestamp,
    SpanName AS span_name,
    ServiceName AS service_name,
    Duration / 1000000 AS duration_ms,
    if(positionCaseInsensitive(StatusCode, 'error') > 0, 'error', 'ok') AS status,
    StatusMessage AS status_message,
    SpanAttributes AS attributes
  FROM telemetry.otel_traces
  WHERE TraceId = {traceId:String}
  ORDER BY Timestamp ASC
  LIMIT 500
`;

export const logsQuery = `
  SELECT
    Timestamp AS timestamp,
    TraceId AS trace_id,
    SpanId AS span_id,
    SeverityText AS severity,
    ServiceName AS service_name,
    Body AS body,
    LogAttributes AS attributes
  FROM telemetry.otel_logs
  WHERE toStartOfFiveMinutes(Timestamp) >= toStartOfFiveMinutes(now() - toIntervalMinute({rangeMinutes:UInt32}))
    AND Timestamp >= now() - toIntervalMinute({rangeMinutes:UInt32})
    AND ({traceId:String} = '' OR TraceId = {traceId:String})
    AND ({service:String} = '' OR ServiceName = {service:String})
    AND ({search:String} = '' OR positionCaseInsensitive(Body, {search:String}) > 0)
  ORDER BY (toStartOfFiveMinutes(Timestamp), Timestamp) DESC
  LIMIT {limit:UInt32}
`;
