const ALLOWED_RANGES = [15, 30, 60, 180, 360, 720, 1440] as const;

export function clampRange(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 60;
  return ALLOWED_RANGES.reduce((closest, candidate) =>
    Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest,
  );
}

export function clampLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 50;
  return Math.min(200, Math.max(1, Math.floor(value)));
}

export function safeSearch(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 120);
}
