import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { initDatabase, getTimeoutTickets, updateTicket, createApprovalRecord } from "@/lib/db";
import { DEFAULT_CONFIG } from "@/lib/config";

export async function GET() {
  await initDatabase();
  try {
    const timeoutTickets = await getTimeoutTickets();
    let processed = 0;
    const now = new Date().toISOString();

    for (const ticket of timeoutTickets) {
      // 根据当前状态决定超时处理
      if (ticket.status === "pending") {
        // 待审批超时 → 强制升级二级审批
        const timeoutAt = new Date(Date.now() + DEFAULT_CONFIG.timeout.level2ReviewHours * 3600000).toISOString();
        await updateTicket(ticket.id, {
          status: "level2_review",
          currentLevel: 2,
          timeoutAt: timeoutAt as unknown as undefined,
        });
        await createApprovalRecord({
          id: uuidv4(),
          ticketId: ticket.id, ticketNo: ticket.ticketNo,
          approver: "SYSTEM", approverRole: "system",
          level: 1,
          action: "escalate" as const,
          opinion: `待审批超时（${DEFAULT_CONFIG.timeout.pendingTimeoutHours}h），自动升级二级审批`,
          triggeredBy: "auto_timeout" as const,
          createdAt: now,
        });
        processed++;
      } else if (ticket.status === "level1_review") {
        // 一级审批超时 → 升级二级审批
        const timeoutAt = new Date(Date.now() + DEFAULT_CONFIG.timeout.level2ReviewHours * 3600000).toISOString();
        await updateTicket(ticket.id, {
          status: "level2_review",
          currentLevel: 2,
          timeoutAt: timeoutAt as unknown as undefined,
        });
        await createApprovalRecord({
          id: uuidv4(),
          ticketId: ticket.id, ticketNo: ticket.ticketNo,
          approver: "SYSTEM", approverRole: "system",
          level: 1,
          action: "escalate" as const,
          opinion: `一级审批超时（${DEFAULT_CONFIG.timeout.level1ReviewHours}h），自动升级二级审批`,
          triggeredBy: "auto_timeout" as const,
          createdAt: now,
        });
        processed++;
      } else if (ticket.status === "level2_review") {
        // 二级审批超时 → 自动驳回
        const newRejectCount = ticket.rejectCount + 1;
        if (newRejectCount >= DEFAULT_CONFIG.resubmit.maxRejectCount) {
          await updateTicket(ticket.id, {
            status: "rejected_final",
            rejectCount: newRejectCount,
            timeoutAt: undefined as unknown as undefined,
          });
        } else {
          const reTimeoutAt = new Date(Date.now() + DEFAULT_CONFIG.timeout.pendingTimeoutHours * 3600000).toISOString();
          await updateTicket(ticket.id, {
            status: "pending",
            rejectCount: newRejectCount,
            timeoutAt: reTimeoutAt as unknown as undefined,
          });
        }
        await createApprovalRecord({
          id: uuidv4(),
          ticketId: ticket.id, ticketNo: ticket.ticketNo,
          approver: "SYSTEM", approverRole: "system",
          level: 2,
          action: "reject" as const,
          opinion: `二级审批超时（${DEFAULT_CONFIG.timeout.level2ReviewHours}h），自动驳回`,
          triggeredBy: "auto_timeout" as const,
          createdAt: now,
        });
        processed++;
      }
    }

    return NextResponse.json({
      success: true,
      data: { total: timeoutTickets.length, processed },
    });
  } catch (err) {
    console.error("[Cron] Check timeouts error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
