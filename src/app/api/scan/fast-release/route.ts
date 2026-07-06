import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  initDatabase, getTicket, updateTicket, createApprovalRecord, updateScanBatchStatus, unlockInventory,
} from "@/lib/db";

export async function POST(req: NextRequest) {
  await initDatabase();
  try {
    const body = await req.json();
    const { ticketId, reason, operator, operatorRole } = body;

    if (!ticketId || !reason || !operator) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // 权限校验：仅品控主管或管理员
    if (operatorRole !== "qc_supervisor" && operatorRole !== "admin") {
      return NextResponse.json({
        success: false,
        error: `仅品控主管可执行快速放行操作。当前角色：${operatorRole}`,
      }, { status: 403 });
    }

    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    if (ticket.exceptionSource !== "scan_trigger") {
      return NextResponse.json({
        success: false,
        error: "快速放行仅适用于扫描触发的品控异常工单",
      }, { status: 400 });
    }

    if (["completed", "rejected_final", "executing"].includes(ticket.status)) {
      return NextResponse.json({
        success: false,
        error: `工单状态为 ${ticket.status}，无法执行快速放行`,
      }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 创建审批记录（留痕）
    await createApprovalRecord({
      id: uuidv4(),
      ticketId, ticketNo: ticket.ticketNo,
      approver: operator, approverRole: operatorRole,
      level: 0,
      action: "approve" as const,
      opinion: `【误判快速放行】复核原因：${reason}`,
      triggeredBy: "manual" as const,
      createdAt: now,
    });

    // 更新工单状态为已完成
    await updateTicket(ticketId, {
      status: "completed",
      executionAction: "release",
      executionDetail: `品控主管 ${operator} 快速放行。原因：${reason}`,
      timeoutAt: undefined as unknown as undefined,
    });

    // 解锁扫描批次
    await updateScanBatchStatus(ticketId, "released");

    // 解锁库存
    if (ticket.waybillSnapshot) {
      const scanRecords = await import("@/lib/db").then((m) => m.getScanRecords({ ticketId }));
      for (const scan of scanRecords) {
        await unlockInventory(scan.skuCode, scan.batchNo);
      }
    }

    return NextResponse.json({
      success: true,
      data: { message: "快速放行成功，批次已解锁，工单已关闭" },
    });
  } catch (err) {
    console.error("[API] Fast release error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
