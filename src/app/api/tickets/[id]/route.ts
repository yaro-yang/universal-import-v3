import { NextRequest, NextResponse } from "next/server";
import { initDatabase, getTicket } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDatabase();
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) {
    return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: ticket });
}
