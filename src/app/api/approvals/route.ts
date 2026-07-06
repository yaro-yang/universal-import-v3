import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  initDatabase, getTicket, updateTicket, createApprovalRecord,
  createCompensationRecord,
} from "@/lib/db";
import { DEFAULT_CONFIG } from "@/lib/config";

export async function POST(req: NextRequest) {
  await initDatabase();
  try {
    const body = await req.json();
    const { ticketId, action, opinion, approver, approverRole, level } = body;

    if (!ticketId || !action || !approver) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    // 权限校验：不能审批自己的工单
    if (ticket.reporter === approver) {
      return NextResponse.json({ success: false, error: "不能审批自己上报的工单" }, { status: 403 });
    }

    // 并发冲突检测（基于 version）
    const updateResult = await updateTicket(ticketId, {
      version: ticket.version + 1,
    }, ticket.version);

    if (!updateResult) {
      return NextResponse.json({
        success: false,
        error: "该工单已被其他人处理，请刷新页面",
      }, { status: 409 });
    }

    const now = new Date().toISOString();
    const recordId = uuidv4();

    if (action === "approve") {
      // 审批通过逻辑
      const approvalRecord = {
        id: recordId,
        ticketId, ticketNo: ticket.ticketNo,
        approver, approverRole, level,
        action: "approve" as const,
        opinion: opinion || "",
        triggeredBy: "manual" as const,
        createdAt: now,
      };
      await createApprovalRecord(approvalRecord);

      // 判断是否需要进入下一级
      const needLevel2 = ticket.amount > DEFAULT_CONFIG.approval.level2Threshold;
      let newStatus = ticket.status;

      if (ticket.status === "pending") {
        newStatus = needLevel2 ? "level2_review" : "executing";
      } else if (ticket.status === "level1_review") {
        newStatus = needLevel2 ? "level2_review" : "executing";
      } else if (ticket.status === "level2_review") {
        newStatus = "executing";
      }

      // 设置下一级超时
      let timeoutAt: string | undefined;
      if (newStatus === "level2_review") {
        timeoutAt = new Date(Date.now() + DEFAULT_CONFIG.timeout.level2ReviewHours * 3600000).toISOString();
      } else if (newStatus === "executing") {
        timeoutAt = undefined; // 执行阶段不设审批超时
      }

      await updateTicket(ticketId, {
        status: newStatus,
        currentLevel: newStatus === "level2_review" ? 2 : ticket.status === "level2_review" ? 2 : 1,
        timeoutAt: timeoutAt as unknown as undefined,
      });

      // 如果进入执行阶段，自动生成赔付记录（如需赔付）
      if (newStatus === "executing") {
        const actionConfig = DEFAULT_CONFIG.exceptionActionMapping[ticket.exceptionType];
        if (actionConfig?.hasCompensation && actionConfig.compensationDirection) {
          await createCompensationRecord({
            id: uuidv4(),
            ticketId,
            approvalRecordId: recordId,
            compensationDirection: actionConfig.compensationDirection,
            amount: ticket.amount,
            status: "pending",
            description: `审批通过自动生成：${actionConfig.description}`,
            createdAt: now,
          });
        }
      }

      return NextResponse.json({
        success: true,
        data: { newStatus, ticket: await getTicket(ticketId) },
      });
    } else if (action === "reject") {
      // 审批拒绝逻辑
      await createApprovalRecord({
        id: recordId,
        ticketId, ticketNo: ticket.ticketNo,
        approver, approverRole, level,
        action: "reject" as const,
        opinion: opinion || "",
        triggeredBy: "manual" as const,
        createdAt: now,
      });

      const newRejectCount = ticket.rejectCount + 1;
      const maxReject = DEFAULT_CONFIG.resubmit.maxRejectCount;

      if (newRejectCount >= maxReject) {
        await updateTicket(ticketId, {
          status: "rejected_final",
          rejectCount: newRejectCount,
          timeoutAt: undefined as unknown as undefined,
        });
        return NextResponse.json({
          success: true,
          data: { newStatus: "rejected_final", message: "超过最大重提次数，工单已关闭" },
        });
      }

      // 退回待审批
      const reSubmitTimeout = new Date(Date.now() + DEFAULT_CONFIG.timeout.pendingTimeoutHours * 3600000).toISOString();
      await updateTicket(ticketId, {
        status: "pending",
        rejectCount: newRejectCount,
        timeoutAt: reSubmitTimeout as unknown as undefined,
      });

      return NextResponse.json({
        success: true,
        data: { newStatus: "pending", rejectCount: newRejectCount, remaining: maxReject - newRejectCount },
      });
    }
  } catch (err) {
    console.error("[API] Approval error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
