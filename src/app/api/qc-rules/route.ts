import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { initDatabase, getQCRules, createQCRule, deleteQCRule } from "@/lib/db";
import { ExceptionType } from "@/types";

export async function GET() {
  await initDatabase();
  const rules = await getQCRules();
  return NextResponse.json({ success: true, data: rules });
}

export async function POST(req: NextRequest) {
  await initDatabase();
  try {
    const body = await req.json();
    const rule = {
      id: uuidv4(),
      name: body.name,
      exceptionSubType: body.exceptionSubType as ExceptionType,
      conditionField: body.conditionField,
      conditionOperator: body.conditionOperator,
      conditionValue: body.conditionValue,
      severity: body.severity || "medium",
      autoCreateTicket: body.autoCreateTicket !== false,
      approvalLevel: body.approvalLevel || 1,
      enabled: true,
      priority: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await createQCRule(rule);
    return NextResponse.json({ success: true, data: rule });
  } catch (err) {
    console.error("[API] QC rule error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  await initDatabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  await deleteQCRule(id);
  return NextResponse.json({ success: true });
}
