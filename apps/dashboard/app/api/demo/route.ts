import { NextRequest, NextResponse } from "next/server";

const allowedModes = new Set(["healthy", "slow", "failed"]);

export async function POST(request: NextRequest) {
  const input = (await request.json()) as { mode?: string };
  const mode = allowedModes.has(input.mode ?? "") ? input.mode : "healthy";
  try {
    const response = await fetch(`${process.env.DEMO_SERVICE_URL ?? "http://localhost:4000"}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, amount: 12900 }),
      signal: AbortSignal.timeout(5_000),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "demo_service_unavailable" }, { status: 503 });
  }
}
