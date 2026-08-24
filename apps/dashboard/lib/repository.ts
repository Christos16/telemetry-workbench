import {
  clickhouseLogs,
  clickhouseOverview,
  clickhouseTrace,
  clickhouseTraces,
} from "./clickhouse";
import {
  fixtureLogRecords,
  fixtureOverview,
  fixtureTrace,
  fixtureTraces,
} from "./fixtures";
import { clampRange } from "./limits";
import type { TraceFilters } from "./types";

function usesClickHouse(): boolean {
  return process.env.DATA_MODE === "clickhouse";
}

export async function getOverview(rangeMinutes?: number) {
  return usesClickHouse()
    ? clickhouseOverview(rangeMinutes)
    : fixtureOverview(clampRange(rangeMinutes));
}

export async function getTraces(filters: TraceFilters) {
  return usesClickHouse() ? clickhouseTraces(filters) : fixtureTraces(filters);
}

export async function getTrace(traceId: string) {
  return usesClickHouse() ? clickhouseTrace(traceId) : fixtureTrace(traceId);
}

export async function getLogs(filters: TraceFilters & { traceId?: string }) {
  return usesClickHouse() ? clickhouseLogs(filters) : fixtureLogRecords(filters);
}
