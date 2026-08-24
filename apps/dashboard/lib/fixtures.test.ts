import { describe, expect, it } from "vitest";
import { fixtureLogRecords, fixtureOverview, fixtureTrace, fixtureTraces } from "./fixtures";

describe("deterministic investigation fixture", () => {
  it("keeps service totals and summary signals internally consistent", () => {
    const overview = fixtureOverview(60);
    const requests = overview.timeline.reduce((sum, point) => sum + point.requests, 0);
    expect(overview.summary.requests).toBe(requests);
    expect(overview.summary.services).toBe(overview.services.length);
    expect(overview.investigations[0].service).toBe("checkout-api");
  });

  it("filters traces by service and error state", () => {
    const traces = fixtureTraces({ service: "payment-adapter", status: "error", limit: 50 });
    expect(traces.length).toBeGreaterThan(0);
    expect(traces.every((trace) => trace.status === "error" && trace.services.includes("payment-adapter"))).toBe(true);
  });

  it("preserves trace/log correlation", () => {
    const trace = fixtureTraces({ status: "error" })[0];
    const detail = fixtureTrace(trace.traceId);
    const logs = fixtureLogRecords({ traceId: trace.traceId });
    expect(detail?.spans.some((span) => span.status === "error")).toBe(true);
    expect(logs.every((log) => log.traceId === trace.traceId)).toBe(true);
  });
});
