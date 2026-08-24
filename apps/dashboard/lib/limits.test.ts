import { describe, expect, it } from "vitest";
import { clampLimit, clampRange, safeSearch } from "./limits";

describe("query budgets", () => {
  it("maps arbitrary ranges to an approved time window", () => {
    expect(clampRange(undefined)).toBe(60);
    expect(clampRange(17)).toBe(15);
    expect(clampRange(1_000_000)).toBe(1440);
  });

  it("bounds result sizes", () => {
    expect(clampLimit(-8)).toBe(1);
    expect(clampLimit(44.9)).toBe(44);
    expect(clampLimit(5_000)).toBe(200);
  });

  it("bounds free-text input without changing its meaning", () => {
    expect(safeSearch("  payment timeout  ")).toBe("payment timeout");
    expect(safeSearch("x".repeat(400))).toHaveLength(120);
  });
});
