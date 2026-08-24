import { NextRequest, NextResponse } from "next/server";
import { getTraces } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    return NextResponse.json(await getTraces({
      rangeMinutes: Number(params.get("range") ?? 60),
      limit: Number(params.get("limit") ?? 50),
      service: params.get("service") ?? undefined,
      status: (params.get("status") as "all" | "ok" | "error" | null) ?? "all",
      search: params.get("search") ?? undefined,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: "traces_unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
