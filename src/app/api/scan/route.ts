import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  initDatabase, createScanRecord, getScanRecords, createTicket,
  getQCRules, hasOpenQCTicket, upsertWaybillSnapshot, lockInventory,
} from "@/lib/db";
import { runQCEngine, QCInput } from "@/lib/qc-engine";
import { getWaybillByExternalCode } from "@/lib/v2-client";
import { generateTicketNo } from "@/lib/utils";
import { DEFAULT_CONFIG } from "@/lib/config";
import { QC_EXCEPTION_TYPES } from "@/types";

export async function GET(req: NextRequest) {
  await initDatabase();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "20");
  const records = await getScanRecords({ limit });
  return NextResponse.json({ success: true, data: records });
}

export async function POST(req: NextRequest) {
  await initDatabase();
  try {
    const body = await req.json();
    const {
      skuCode, batchNo, expectedQuantity, actualQuantity,
      damageLevel, specDeviation, labelMatch, batchValid,
      operator, operatorRole,
    } = body;

    if (!skuCode || !operator) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // 通过 V2 接口校验 SKU 归属（使用默认运单号进行模拟）
    // 实际环境中需要运单号输入
    let waybillData = null;
    const externalCode = body.externalCode;

    if (externalCode) {
      const { waybills, error } = await getWaybillByExternalCode(externalCode);
      if (error) {
        return NextResponse.json({
          success: false,
          error: `V2 接口调用失败：${error}。请确认 V2 服务是否可用。`,
        }, { status: 502 });
      }
      if (waybills.length === 0) {
        return NextResponse.json({ success: false, error: `未找到运单 ${externalCode}` }, { status: 404 });
      }
      waybillData = waybills[0];

      // 保存快照
      const snapId = uuidv4();
      await upsertWaybillSnapshot({
        id: snapId,
        waybillId: waybillData.id,
        externalCode: waybillData.externalCode,
        storeName: waybillData.storeName,
        recipientName: waybillData.recipientName,
        recipientPhone: waybillData.recipientPhone,
        recipientAddress: waybillData.recipientAddress,
        totalAmount: 0,
        skuCount: waybillData.items?.length || 0,
        rawData: waybillData as unknown as Record<string, unknown>,
        syncedAt: new Date().toISOString(),
        dataVersion: 1,
      });
    }

    // 加载品控规则
    const rules = await getQCRules();

    // 运行品控引擎
    const qcInput: QCInput = {
      skuCode,
      expectedQuantity,
      actualQuantity,
      damageLevel,
      specDeviation,
      labelMatch,
      batchValid,
    };
    const qcResult = runQCEngine(qcInput, rules);

    const now = new Date().toISOString();
    const scanId = uuidv4();
    let ticketId: string | undefined;

    // 获取 waybillData 的 id
    const wbId = waybillData ? (waybillData as unknown as Record<string, unknown>).id as string : undefined;

    if (!qcResult.passed) {
      // 品控异常 — 检查幂等性
      const { hasOpen, ticketId: existingTicketId } = await hasOpenQCTicket(skuCode, batchNo);
      if (hasOpen && existingTicketId) {
        // 只追加扫描记录，不创建新工单
        await createScanRecord({
          id: scanId,
          waybillSnapshotId: wbId,
          externalCode: externalCode || undefined,
          skuCode, batchNo, scanTime: now, operator,
          qcResult: "fail", failReason: qcResult.summary,
          triggeredRuleId: qcResult.matchedRules.find((m) => m.matched)?.rule.id,
          triggeredRuleName: qcResult.matchedRules.find((m) => m.matched)?.rule.name,
          batchStatus: "qc_hold",
          ticketId: existingTicketId,
          createdAt: now,
        });

        return NextResponse.json({
          success: true,
          data: {
            scan: { id: scanId, skuCode, qcResult: "fail", failReason: qcResult.summary, batchStatus: "qc_hold" },
            ticket: { id: existingTicketId, ticketNo: "已存在", isDuplicate: true },
            message: "该批次已存在未关闭品控工单，已追加扫描记录",
          },
        });
      }

      // 创建新工单
      const qtTimeoutHours = DEFAULT_CONFIG.qcHold.timeoutHours;
      const timeoutAt = new Date(Date.now() + qtTimeoutHours * 3600000).toISOString();

      const ticket = await createTicket({
        id: uuidv4(),
        ticketNo: generateTicketNo(),
        waybillSnapshotId: wbId,
        exceptionType: qcResult.exceptionType || QC_EXCEPTION_TYPES[0],
        exceptionSource: "scan_trigger",
        description: `品控扫描检测异常：${qcResult.summary}`,
        amount: 0,
        reporter: operator,
        reporterRole: operatorRole || "operator",
        status: "level2_review", // 品控异常直接进入二级审批
        currentLevel: 2,
        rejectCount: 0,
        maxRejectCount: 3,
        timeoutAt,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      ticketId = ticket.id;

      // 锁定库存
      await lockInventory(skuCode, batchNo);
    }

    // 创建扫描记录
    await createScanRecord({
      id: scanId,
      waybillSnapshotId: wbId,
      externalCode: externalCode || undefined,
      skuCode, batchNo, scanTime: now, operator,
      qcResult: qcResult.passed ? "pass" : "fail",
      failReason: qcResult.passed ? undefined : qcResult.summary,
      triggeredRuleId: qcResult.passed ? undefined : qcResult.matchedRules.find((m) => m.matched)?.rule.id,
      triggeredRuleName: qcResult.passed ? undefined : qcResult.matchedRules.find((m) => m.matched)?.rule.name,
      batchStatus: qcResult.passed ? "normal" : "qc_hold",
      ticketId,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      data: {
        scan: {
          id: scanId, skuCode, qcResult: qcResult.passed ? "pass" : "fail",
          failReason: qcResult.passed ? undefined : qcResult.summary,
          triggeredRuleName: qcResult.passed ? undefined : qcResult.matchedRules.find((m) => m.matched)?.rule.name,
          batchStatus: qcResult.passed ? "normal" : "qc_hold",
        },
        qcDetail: qcResult,
        ticket: ticketId ? { id: ticketId } : undefined,
      },
    });
  } catch (err) {
    console.error("[API] Scan error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
