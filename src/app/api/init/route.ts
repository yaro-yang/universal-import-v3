import { NextResponse } from "next/server";
import { initDatabase } from "@/lib/db";

export async function GET() {
  const success = await initDatabase();
  return NextResponse.json({
    success,
    message: success ? "Database initialized successfully" : "Initialization failed, using memory mode",
  });
}
