import { NextRequest, NextResponse } from "next/server";
import { EXCEPTION_TYPE_LABELS, ExceptionType } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { description, exceptionType } = body;

    // 模拟 AI 建议（实际可接入大模型）
    // 如果配置了 AI_API_KEY，可调用真实 AI 服务
    const aiApiKey = process.env.AI_API_KEY;
    if (aiApiKey) {
      // TODO: 真实 AI 调用
      // const response = await fetch(process.env.AI_API_URL!, { ... });
    }

    // 基于关键词的简单建议（降级方案）
    let suggestedType: ExceptionType = exceptionType || "damaged";
    let reason = "基于描述内容分析（AI 建议，需人工确认）";

    const desc = (description || "").toLowerCase();
    if (desc.includes("丢") || desc.includes("丢失") || desc.includes("找不到")) {
      suggestedType = "lost"; reason = "描述中包含'丢件'相关关键词";
    } else if (desc.includes("破") || desc.includes("损坏") || desc.includes("碎")) {
      suggestedType = "damaged"; reason = "描述中包含'破损'相关关键词";
    } else if (desc.includes("拒收") || desc.includes("退回")) {
      suggestedType = "rejected"; reason = "描述中包含'拒收'相关关键词";
    } else if (desc.includes("超时") || desc.includes("到") || desc.includes("未签收")) {
      suggestedType = "timeout"; reason = "描述中包含'超时'相关关键词";
    } else if (desc.includes("地址") || desc.includes("错误")) {
      suggestedType = "address_error"; reason = "描述中包含'地址错误'相关关键词";
    }

    return NextResponse.json({
      success: true,
      data: {
        type: suggestedType,
        typeLabel: EXCEPTION_TYPE_LABELS[suggestedType],
        reason,
        disclaimer: "AI 建议，需人工确认",
      },
    });
  } catch (err) {
    console.error("[AI] Suggest error:", err);
    // AI 失败不应阻塞主流程
    return NextResponse.json({
      success: false,
      error: "AI service unavailable",
    });
  }
}
