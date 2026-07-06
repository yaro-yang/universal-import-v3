import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ success: true, status: "healthy", service: "universal-import-v3" });
}
