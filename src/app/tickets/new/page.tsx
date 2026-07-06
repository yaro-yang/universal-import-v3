"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import { EXCEPTION_TYPE_LABELS, ExceptionType, LOGISTICS_EXCEPTION_TYPES, CurrentUser, MOCK_USERS } from "@/types";
import { checkV2Health, getWaybillByExternalCode } from "@/lib/v2-client";

const LOGISTICS_ACTION_MAP: Record<ExceptionType, { desc: string; hasCompensation: boolean; direction?: string }> = {
  lost: { desc: "丢件：理赔 + 重新发货", hasCompensation: true, direction: "赔付客户" },
  damaged: { desc: "破损：理赔 + 退货入库", hasCompensation: true, direction: "赔付客户" },
  rejected: { desc: "客户拒收：退货入库（一般不赔付）", hasCompensation: false },
  timeout: { desc: "超时未签收：重新发货（一般不赔付）", hasCompensation: false },
  address_error: { desc: "地址错误：重新发货（一般不赔付）", hasCompensation: false },
  qc_quantity: { desc: "仅品控异常，请通过扫描触发", hasCompensation: true },
  qc_appearance: { desc: "仅品控异常，请通过扫描触发", hasCompensation: true },
  qc_spec: { desc: "仅品控异常，请通过扫描触发", hasCompensation: true },
  qc_label: { desc: "仅品控异常，请通过扫描触发", hasCompensation: true },
  qc_batch: { desc: "仅品控异常，请通过扫描触发", hasCompensation: true },
};

export default function NewTicketPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser>(MOCK_USERS[4]);
  const [waybillCode, setWaybillCode] = useState("");
  const [exceptionType, setExceptionType] = useState<ExceptionType>("damaged");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [v2Status, setV2Status] = useState<{ healthy: boolean; latency: number; statusCode?: number } | null>(null);
  const [verifiedWaybill, setVerifiedWaybill] = useState<Record<string, unknown> | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{ type: ExceptionType; reason: string } | null>(null);
  const [v2Unavailable, setV2Unavailable] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("v3_current_user");
    if (saved) try { setUser(JSON.parse(saved)); } catch {}
    checkHealth();
  }, []);

  async function checkHealth() {
    const result = await checkV2Health();
    setV2Status(result);
    setV2Unavailable(!result.healthy);
  }

  async function verifyWaybill() {
    if (!waybillCode.trim()) { toast.error("请输入运单号"); return; }
    if (!v2Status?.healthy) { toast.error("V2 服务不可用，无法校验运单。请稍后重试或检查 V2 服务状态。"); return; }
    setVerifying(true);
    setVerifiedWaybill(null);
    try {
      const { waybills, error } = await getWaybillByExternalCode(waybillCode.trim());
      if (error) {
        if (error.includes("timeout") || error.includes("Network") || error.includes("fetch")) {
          setV2Unavailable(true);
          toast.error("V2 服务不可用或超时，请稍后重试");
        } else if (error.includes("404") || error.includes("not found")) {
          toast.error(`未找到运单 ${waybillCode}，请确认运单号是否正确`);
        } else {
          toast.error(error);
        }
      } else if (waybills.length > 0) {
        setVerifiedWaybill(waybills[0] as unknown as Record<string, unknown>);
        setV2Unavailable(false);
        toast.success(`运单 ${waybillCode} 验证通过（通过 V2 接口实时校验）`);
        // 尝试 AI 建议
        try {
          const aiRes = await fetch("/api/ai-suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description, exceptionType }),
          });
          const aiData = await aiRes.json();
          if (aiData.success && aiData.data) setAiSuggestion(aiData.data);
        } catch {}
      } else {
        toast.error(`未找到运单 ${waybillCode}`);
      }
    } catch { toast.error("验证失败，请检查网络"); }
    setVerifying(false);
  }

  async function handleSubmit() {
    if (!verifiedWaybill) { toast.error("请先验证运单号"); return; }
    if (!description.trim()) { toast.error("请填写异常描述"); return; }

    setLoading(true);
    try {
      const wb = verifiedWaybill as Record<string, string>;
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exceptionType,
          exceptionSource: "manual",
          description: description.trim(),
          amount: amount ? parseFloat(amount) : 0,
          reporter: user.name,
          reporterRole: user.role,
          waybillSnapshotId: wb.id,
          waybillExternalCode: wb.externalCode || waybillCode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`工单 ${data.data.ticketNo} 已创建`);
        router.push(`/tickets/${data.data.id}`);
      } else {
        toast.error(data.error || "创建失败");
      }
    } catch { toast.error("网络错误"); }
    setLoading(false);
  }

  const actionInfo = LOGISTICS_ACTION_MAP[exceptionType];

  return (
    <div className="page-container animate-fade-in" style={{ padding: "24px 28px", maxWidth: 800 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>异常上报</h2>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 24 }}>
        物流类异常 — 手工上报。系统将调用 V2 接口实时校验运单真实性。
      </p>

      {/* V2 连接状态 */}
      <div style={{
        padding: "10px 16px", borderRadius: 8, marginBottom: 20,
        background: v2Status?.healthy ? "#f6ffed" : "#fff1f0",
        border: `1px solid ${v2Status?.healthy ? "#b7eb8f" : "#ffccc7"}`,
        fontSize: 13,
      }}>
        V2 系统状态：
        <span style={{ fontWeight: 600, color: v2Status?.healthy ? "#00a854" : "#cf1322" }}>
          {v2Status ? (v2Status.healthy ? "● 正常" : "● 不可用") : "检测中..."}
        </span>
        {v2Status && <span style={{ marginLeft: 8, color: "var(--text-tertiary)" }}>延迟 {v2Status.latency}ms</span>}
        {v2Status && v2Status.statusCode && !v2Status.healthy && (
          <span style={{ marginLeft: 4, fontSize: 11, color: "#999" }}>(HTTP {v2Status.statusCode})</span>
        )}
        {v2Status && !v2Status.healthy && (
          <span style={{ marginLeft: 8, color: "#d97b00", fontSize: 12, fontWeight: 500 }}>
            {v2Status.statusCode === 408 || v2Status.statusCode === 0
              ? "（网络超时，请确认 V2 服务是否已部署到 Vercel）"
              : v2Status.statusCode === 401
                ? "（API Key 不匹配，请检查环境变量 V2_API_KEY）"
                : "（V2 不可用时无法提交异常工单，需实时校验运单存在性）"}
          </span>
        )}
      </div>

      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "24px" }}>
        {/* 步骤1：运单验证 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{
              width: 24, height: 24, borderRadius: "50%", background: "#0fc6c2",
              color: "white", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700,
            }}>1</span>
            <label style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>验证运单</label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text" value={waybillCode} onChange={(e) => setWaybillCode(e.target.value)}
              placeholder="输入 V2 系统中的运单号（如 PS2512220005001）" style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => e.key === "Enter" && verifyWaybill()}
            />
            <Button onClick={verifyWaybill} loading={verifying} variant="outline">验证</Button>
          </div>
          {verifiedWaybill && (
            <div style={{ marginTop: 8, padding: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: "#00a854", marginBottom: 4 }}>✅ 运单验证通过（通过 V2 接口实时校验）</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                <span>运单号：{waybillCode}</span>
                <span>收件人：{String((verifiedWaybill as Record<string, unknown>).recipientName || "-")}</span>
                <span>门店：{String((verifiedWaybill as Record<string, unknown>).storeName || "-")}</span>
                <span>电话：{String((verifiedWaybill as Record<string, unknown>).recipientPhone || "-")}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                数据来源：实时获取自 V2 系统
              </div>
            </div>
          )}
        </div>

        {/* 步骤2：填写异常信息 */}
        <div style={{ marginBottom: 24, borderTop: "1px solid var(--border-light)", paddingTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{
              width: 24, height: 24, borderRadius: "50%", background: "#0fc6c2",
              color: "white", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700,
            }}>2</span>
            <label style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>填写异常信息</label>
          </div>

          {/* 异常类型 */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>异常类型 *</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {LOGISTICS_EXCEPTION_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setExceptionType(t)}
                  style={{
                    padding: "8px 16px", borderRadius: 8, border: `1px solid ${exceptionType === t ? "#0fc6c2" : "var(--border)"}`,
                    background: exceptionType === t ? "#e8fafa" : "white",
                    color: exceptionType === t ? "#0fc6c2" : "var(--text-secondary)",
                    cursor: "pointer", fontSize: 13, fontWeight: exceptionType === t ? 600 : 400,
                    transition: "all 0.2s",
                  }}
                >
                  {EXCEPTION_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* 异常描述 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>异常描述 *</label>
              <span
                style={{ fontSize: 12, color: "#0fc6c2", cursor: "pointer" }}
                onClick={async () => {
                  if (!description.trim() || description.length < 3) { toast.error("请先填写异常描述（至少 3 个字）"); return; }
                  try {
                    const aiRes = await fetch("/api/ai-suggest", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ description }),
                    });
                    const aiData = await aiRes.json();
                    if (aiData.success && aiData.data) {
                      setAiSuggestion(aiData.data);
                      const aiType = aiData.data.type as ExceptionType;
                      if (LOGISTICS_EXCEPTION_TYPES.includes(aiType)) {
                        setExceptionType(aiType);
                        toast.success(`AI 建议：${EXCEPTION_TYPE_LABELS[aiType]}（需人工确认）`);
                      }
                    }
                  } catch {}
                }}
              >
                🤖 AI 分类建议
              </span>
            </div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="请详细描述异常情况（丢件/破损/拒收/超时/地址错误等）..."
              style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} />
            {aiSuggestion && (
              <div style={{ marginTop: 8, padding: "10px 14px", background: "#fffbe6", border: "1px solid #ffe4ba", borderRadius: 6, fontSize: 12 }}>
                <div style={{ color: "#d97b00", fontWeight: 600, marginBottom: 4 }}>💡 AI 分析结果</div>
                <div>建议类型：{EXCEPTION_TYPE_LABELS[aiSuggestion.type]} — {aiSuggestion.reason}</div>
                <div style={{ color: "#999", marginTop: 2 }}>⚠️ AI 建议，需人工确认。请核对后决定是否采纳。</div>
              </div>
            )}
          </div>

          {/* 金额 */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>涉及金额（元）</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="预估损失金额（影响审批层级）" style={{ ...inputStyle, width: 250 }} />
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              {Number(amount || 0) > 5000
                ? "金额超过 ¥5,000 → 将进入二级审批"
                : "金额 ≤ ¥5,000 → 一级审批即可"}
            </div>
          </div>

          {/* 异常类型处理说明 */}
          <div style={{ padding: "12px 16px", background: "#f7f8fa", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", marginBottom: 20 }}>
            <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>📋 {actionInfo?.desc}</div>
            {actionInfo?.hasCompensation && (
              <div style={{ color: "#d97b00" }}>该异常类型审批通过后将生成赔付记录（{actionInfo.direction}）</div>
            )}
            <div style={{ marginTop: 6, color: "var(--text-tertiary)" }}>
              异常类型区分：物流异常赔付方向为「赔付客户」，品控异常赔付方向为「向供应商追偿」。
              品控类异常请通过「扫描品控」功能自动触发。
            </div>
          </div>
        </div>

        {/* 提交 */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", borderTop: "1px solid var(--border-light)", paddingTop: 20 }}>
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!verifiedWaybill || !v2Status?.healthy}>
            {v2Status?.healthy ? "提交异常工单" : "V2 不可用，无法提交"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, outline: "none" };
