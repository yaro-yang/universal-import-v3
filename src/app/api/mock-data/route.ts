import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  initDatabase, createTicket, createApprovalRecord, createCompensationRecord,
  upsertWaybillSnapshot, createScanRecord,
} from "@/lib/db";
import { generateTicketNo } from "@/lib/utils";
import { ExceptionType, TicketStatus, LOGISTICS_EXCEPTION_TYPES, QC_EXCEPTION_TYPES } from "@/types";

const REPORTERS = ["张三", "李四", "王五", "赵六", "陈七"];
const APPROVERS = ["王五（一级审批）", "赵六（二级审批）", "管理员"];
const STORES = ["龙湖天街店", "万达广场店", "万象城店", "大悦城店", "太古里店"];
const CITIES = ["海口", "北京", "上海", "深圳", "成都"];
const SKUS = ["SKU-001", "SKU-002", "SKU-003", "SKU-004", "SKU-005"];

function randomType(): ExceptionType {
  const all = [...LOGISTICS_EXCEPTION_TYPES, ...QC_EXCEPTION_TYPES];
  return all[Math.floor(Math.random() * all.length)];
}

function randomAmount(): number {
  return Math.round((Math.random() * 15000 + 100) * 100) / 100;
}

function randomStatus(): TicketStatus {
  const statuses: TicketStatus[] = ["pending", "level1_review", "level2_review", "executing", "completed", "rejected_final"];
  const weights = [0.15, 0.2, 0.15, 0.15, 0.25, 0.1];
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < statuses.length; i++) {
    cumulative += weights[i];
    if (r <= cumulative) return statuses[i];
  }
  return "completed";
}

export async function POST() {
  await initDatabase();
  try {
    let count = 0;
    const now = new Date();

    // 先生成一些运单快照
    const snapshots: { id: string; waybillId: string; externalCode: string; storeName: string }[] = [];
    for (let i = 0; i < 20; i++) {
      const snapId = uuidv4();
      const waybillId = uuidv4();
      const externalCode = `PS${String(Math.floor(Math.random() * 9999999)).padStart(7, "0")}`;
      const storeName = STORES[i % STORES.length];
      const city = CITIES[i % CITIES.length];
      snapshots.push({ id: snapId, waybillId, externalCode, storeName });
      await upsertWaybillSnapshot({
        id: snapId,
        waybillId,
        externalCode,
        storeName,
        recipientName: `收件人_${i + 1}`,
        recipientPhone: `13800${String(i + 1).padStart(3, "0")}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`,
        recipientAddress: `${city}市某某路${i + 1}号`,
        totalAmount: Math.round(Math.random() * 20000 * 100) / 100,
        skuCount: Math.floor(Math.random() * 5) + 1,
        rawData: { storeName, recipientName: `收件人_${i + 1}`, items: [] },
        syncedAt: new Date(now.getTime() - Math.random() * 7 * 24 * 3600000).toISOString(),
        dataVersion: 1,
      });
    }

    for (let i = 0; i < 220; i++) {
      const exceptionType = randomType();
      const isQC = QC_EXCEPTION_TYPES.includes(exceptionType);
      const status = randomStatus();
      const amount = randomAmount();
      const reporter = REPORTERS[Math.floor(Math.random() * REPORTERS.length)];
      const createTime = new Date(now.getTime() - Math.random() * 30 * 24 * 3600000);

      // 随机关联一个快照
      const snapshot = snapshots[i % snapshots.length];

      let timeoutAt: string | undefined;
      if (["pending", "level1_review", "level2_review"].includes(status)) {
        const hours = status === "pending" ? 24 : status === "level1_review" ? 48 : 72;
        // 有些已超时，有些即将超时
        const offset = Math.random() > 0.3 ? hours * 3600000 : -(Math.random() * 12 * 3600000);
        timeoutAt = new Date(createTime.getTime() + offset).toISOString();
      }

      const ticket = await createTicket({
        id: uuidv4(),
        ticketNo: generateTicketNo(i),
        waybillSnapshotId: snapshot.id,
        exceptionType,
        exceptionSource: isQC ? "scan_trigger" : "manual",
        description: `模拟${isQC ? "品控" : "物流"}异常：${exceptionType}。运单 ${snapshot.externalCode}，门店 ${snapshot.storeName}。这是第 ${i + 1} 条测试数据。`,
        amount,
        reporter,
        reporterRole: "operator",
        status,
        currentLevel: status === "level2_review" ? 2 : 1,
        rejectCount: status === "rejected_final" ? 3 : Math.floor(Math.random() * 3),
        maxRejectCount: 3,
        timeoutAt,
        version: 1,
        executionAction: status === "executing" ? "resend" : status === "completed" ? "resend" : undefined,
        createdAt: createTime.toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 为扫描触发的工单生成扫描记录
      if (isQC) {
        const skuCode = SKUS[i % SKUS.length];
        const qcPassed = status === "completed" || (Math.random() > 0.5 && ["pending", "level1_review", "level2_review"].includes(status));
        await createScanRecord({
          id: uuidv4(),
          waybillSnapshotId: snapshot.id,
          externalCode: snapshot.externalCode,
          skuCode,
          skuName: `${skuCode}商品`,
          batchNo: `BATCH-${String(i + 1).padStart(3, "0")}`,
          scanTime: createTime.toISOString(),
          operator: reporter,
          qcResult: qcPassed && status !== "executing" && status !== "rejected_final" ? "pass" : "fail",
          failReason: qcPassed ? undefined : `品控检测异常：${exceptionType}`,
          triggeredRuleId: uuidv4(),
          triggeredRuleName: `检测规则_${(i % 7) + 1}`,
          batchStatus: status === "completed" ? "released" : "qc_hold",
          ticketId: ticket.id,
          createdAt: createTime.toISOString(),
        });
      }

      // 为已有审批状态的工单生成审批记录
      if (["level1_review", "level2_review", "executing", "completed"].includes(status)) {
        const approver = APPROVERS[Math.floor(Math.random() * APPROVERS.length)];
        await createApprovalRecord({
          id: uuidv4(),
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          approver,
          approverRole: "level1_approver",
          level: 1,
          action: "approve",
          opinion: `模拟审批通过：${exceptionType}异常已确认，建议${isQC ? "退回供应商" : "理赔处理"}`,
          triggeredBy: "manual",
          createdAt: new Date(createTime.getTime() + 3600000).toISOString(),
        });

        // 对于二级审批状态的工单，再添加一条二级审批记录
        if (status === "level2_review" || status === "completed") {
          const approver2 = APPROVERS[(APPROVERS.indexOf(approver) + 1) % APPROVERS.length];
          await createApprovalRecord({
            id: uuidv4(),
            ticketId: ticket.id,
            ticketNo: ticket.ticketNo,
            approver: approver2,
            approverRole: "level2_approver",
            level: 2,
            action: status === "completed" ? "approve" : "escalate",
            opinion: status === "completed" ? "二级审批通过，准予执行" : "自动升级至二级审批",
            triggeredBy: status === "completed" ? "manual" : "auto_escalation",
            createdAt: new Date(createTime.getTime() + 7200000).toISOString(),
          });
        }
      }

      // 为已完成工单生成赔付记录
      if (status === "completed" && amount > 500) {
        await createCompensationRecord({
          id: uuidv4(),
          ticketId: ticket.id,
          approvalRecordId: uuidv4(),
          compensationDirection: isQC ? "from_supplier" : "to_customer",
          amount: Math.round(amount * 0.8 * 100) / 100,
          status: "processed",
          description: `模拟赔付 - ${isQC ? "向供应商追偿" : "赔付客户"}（关联运单 ${snapshot.externalCode}）`,
          createdAt: new Date(createTime.getTime() + 7200000).toISOString(),
        });
      }

      // 为 rejected_final 状态的工单生成拒绝记录
      if (status === "rejected_final") {
        const approver = APPROVERS[Math.floor(Math.random() * APPROVERS.length)];
        await createApprovalRecord({
          id: uuidv4(),
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          approver,
          approverRole: "level2_approver",
          level: 2,
          action: "reject",
          opinion: "模拟拒绝：超过最大重提次数，工单已关闭",
          triggeredBy: "manual",
          createdAt: new Date(createTime.getTime() + 3600000).toISOString(),
        });
      }

      count++;
    }

    return NextResponse.json({
      success: true,
      data: {
        count,
        message: `成功生成 ${count} 条模拟工单（含 ${snapshots.length} 条运单快照、扫描记录、审批记录和赔付记录）`,
      },
    });
  } catch (err) {
    console.error("[API] Mock data error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
