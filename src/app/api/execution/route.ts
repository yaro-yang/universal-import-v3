import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  initDatabase, getTicket, updateTicket, createApprovalRecord,
  createCompensationRecord, updateInventory,
} from "@/lib/db";
import { DEFAULT_CONFIG } from "@/lib/config";

export async function POST(req: NextRequest) {
  await initDatabase();
  try {
    const body = await req.json();
    const { ticketId, operator } = body;

    if (!ticketId) {
      return NextResponse.json({ success: false, error: "Missing ticketId" }, { status: 400 });
    }

    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    if (ticket.status !== "executing") {
      return NextResponse.json({
        success: false,
        error: `工单状态为 ${ticket.status}，不能执行联动操作`,
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const actionConfig = DEFAULT_CONFIG.exceptionActionMapping[ticket.exceptionType];

    if (!actionConfig) {
      return NextResponse.json({
        success: false,
        error: `未找到异常类型 ${ticket.exceptionType} 的执行配置`,
      }, { status: 400 });
    }

    // 执行联动动作：库存 + 赔付一致性（同一事务内）
    // 注：由于 V3 独立部署且使用 Serverless DB，完整事务需 DB 层面支持
    // 此处采用顺序执行 + 补偿策略保证最终一致性

    try {
      // 1. 库存变更
      if (actionConfig.inventoryImpact === "decrease") {
        // 重新发货等：扣减库存
        await updateInventory("DEFAULT_SKU", -1, 0);
      } else if (actionConfig.inventoryImpact === "increase") {
        // 退货入库：增加库存
        await updateInventory("DEFAULT_SKU", 1, 0);
      }

      // 2. 生成赔付记录（如果尚未生成）
      const existingComp = ticket.compensationRecord;
      if (actionConfig.hasCompensation && actionConfig.compensationDirection && !existingComp) {
        await createCompensationRecord({
          id: uuidv4(),
          ticketId,
          approvalRecordId: ticket.approvalRecords?.[ticket.approvalRecords.length - 1]?.id,
          compensationDirection: actionConfig.compensationDirection,
          amount: ticket.amount,
          status: "processed",
          description: `执行联动生成：${actionConfig.description}`,
          createdAt: now,
        });
      }

      // 3. 更新工单状态为已完成
      const executionAction = actionConfig.actions[0];
      await updateTicket(ticketId, {
        status: "completed",
        executionAction: executionAction as unknown as undefined,
        executionDetail: `${operator || "SYSTEM"} 执行了：${actionConfig.description}`,
      });

      // 4. 添加执行记录
      await createApprovalRecord({
        id: uuidv4(),
        ticketId, ticketNo: ticket.ticketNo,
        approver: operator || "SYSTEM",
        approverRole: "operator",
        level: 0,
        action: "approve" as const,
        opinion: `执行联动完成：${actionConfig.description}`,
        triggeredBy: "manual" as const,
        createdAt: now,
      });

      return NextResponse.json({
        success: true,
        data: {
          message: "执行联动完成",
          actions: actionConfig.actions,
        },
      });
    } catch (execErr) {
      console.error("[Execution] Execution error, attempting compensation:", execErr);
      // 补偿：回滚库存变更
      try {
        if (actionConfig.inventoryImpact === "decrease") {
          await updateInventory("DEFAULT_SKU", 1, 0);
        } else if (actionConfig.inventoryImpact === "increase") {
          await updateInventory("DEFAULT_SKU", -1, 0);
        }
      } catch (compErr) {
        console.error("[Execution] Compensation failed:", compErr);
      }
      return NextResponse.json({
        success: false,
        error: "执行联动失败，已执行补偿操作。" + (execErr instanceof Error ? execErr.message : ""),
      }, { status: 500 });
    }
  } catch (err) {
    console.error("[API] Execution error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
