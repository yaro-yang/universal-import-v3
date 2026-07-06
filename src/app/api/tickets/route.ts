import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { initDatabase, createTicket, listTickets } from "@/lib/db";
import { ExceptionType, ExceptionSource, TicketStatus } from "@/types";
import { generateTicketNo } from "@/lib/utils";

export async function GET(req: NextRequest) {
  await initDatabase();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as TicketStatus | null;
  const exceptionType = searchParams.get("exceptionType") as ExceptionType | null;
  const exceptionSource = searchParams.get("exceptionSource") as ExceptionSource | null;
  const waybillCode = searchParams.get("waybillCode") || undefined;
  const reporter = searchParams.get("reporter") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  const result = await listTickets({
    status: status || undefined,
    exceptionType: exceptionType || undefined,
    exceptionSource: exceptionSource || undefined,
    waybillCode,
    reporter,
    page,
    pageSize,
  });

  return NextResponse.json({ success: true, data: result });
}

export async function POST(req: NextRequest) {
  await initDatabase();
  try {
    const body = await req.json();
    const { exceptionType, exceptionSource, description, amount, reporter, reporterRole, waybillSnapshotId } = body;

    if (!exceptionType || !reporter) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // 检查同类型未关闭工单
    const existing = await listTickets({ waybillCode: undefined, pageSize: 200 });
    const duplicate = existing.tickets.find(
      (t) =>
        t.waybillSnapshotId === waybillSnapshotId &&
        t.exceptionType === exceptionType &&
        !["completed", "rejected_final"].includes(t.status)
    );
    if (duplicate) {
      return NextResponse.json({
        success: false,
        error: `该运单已存在同类型未关闭工单：${duplicate.ticketNo}`,
      }, { status: 409 });
    }

    // 计算超时时间
    const timeoutHours = 24; // pending 默认 24 小时
    const timeoutAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString();

    const ticket = await createTicket({
      id: uuidv4(),
      ticketNo: generateTicketNo(),
      waybillSnapshotId,
      exceptionType,
      exceptionSource: exceptionSource || "manual",
      description: description || "",
      amount: amount || 0,
      reporter,
      reporterRole: reporterRole || "operator",
      status: "pending",
      currentLevel: 0,
      rejectCount: 0,
      maxRejectCount: 3,
      timeoutAt,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, data: ticket });
  } catch (err) {
    console.error("[API] Create ticket error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
