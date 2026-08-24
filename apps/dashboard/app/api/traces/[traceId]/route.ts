import { NextRequest, NextResponse } from "next/server";
import { getTrace } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ traceId: string }> },
) {
  const { traceId } = await context.params;
  try {
    const trace = await getTrace(traceId);
    return trace
      ? NextResponse.json(trace)
      : NextResponse.json({ error: "trace_not_found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: "trace_unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
