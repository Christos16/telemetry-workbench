import { describe, expect, it } from "vitest";
import { logsQuery, traceDetailQuery, traceListQuery } from "./queries";

describe("ClickHouse query safety", () => {
  it("uses query parameters for all request-controlled values", () => {
    expect(traceListQuery).toContain("{service:String}");
    expect(traceListQuery).toContain("{search:String}");
    expect(traceListQuery).toContain("{limit:UInt32}");
    expect(traceDetailQuery).toContain("{traceId:String}");
    expect(logsQuery).toContain("{traceId:String}");
  });

  it("uses both the physical time bucket and exact timestamp for log scans", () => {
    expect(logsQuery).toContain("toStartOfFiveMinutes(Timestamp)");
    expect(logsQuery).toContain("Timestamp >= now()");
  });
});
