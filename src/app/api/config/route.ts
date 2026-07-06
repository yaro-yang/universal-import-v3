import { NextRequest, NextResponse } from "next/server";
import { initDatabase, setConfig, getAllConfigs } from "@/lib/db";

export async function GET() {
  await initDatabase();
  const configs = await getAllConfigs();
  const data = configs.map((c) => ({ key: c.configKey, value: c.configValue, desc: c.description }));
  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  await initDatabase();
  try {
    const body = await req.json();
    const { key, value } = body;
    if (!key || value === undefined) {
      return NextResponse.json({ success: false, error: "Missing key or value" }, { status: 400 });
    }
    await setConfig(key, String(value));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API] Config error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
