import { NextResponse } from "next/server";
import { initDatabase, getSyncStats } from "@/lib/db";
import { checkV2Health } from "@/lib/v2-client";

export async function GET() {
  await initDatabase();
  const stats = await getSyncStats();
  const health = await checkV2Health();
  return NextResponse.json({
    success: true,
    data: { ...stats, v2Health: health },
  });
}
