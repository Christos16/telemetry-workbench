import { NextRequest, NextResponse } from "next/server";
import { getOverview } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const range = Number(request.nextUrl.searchParams.get("range") ?? 60);
  try {
    return NextResponse.json(await getOverview(range));
  } catch (error) {
    return NextResponse.json(
      { error: "overview_unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
