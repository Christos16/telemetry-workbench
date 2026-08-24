import { NextRequest, NextResponse } from "next/server";
import { getLogs } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    return NextResponse.json(await getLogs({
      rangeMinutes: Number(params.get("range") ?? 60),
      limit: Number(params.get("limit") ?? 50),
      traceId: params.get("traceId") ?? undefined,
      service: params.get("service") ?? undefined,
      search: params.get("search") ?? undefined,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: "logs_unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
