"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/TableDecorations";
import Modal from "@/components/ui/Modal";
import { CurrentUser, MOCK_USERS, ScanRecord, ExceptionTicket } from "@/types";
import { checkV2Health } from "@/lib/v2-client";

export default function ScanPage() {
  const [user, setUser] = useState<CurrentUser>(MOCK_USERS[4]);
  const [externalCode, setExternalCode] = useState("");
  const [skuCode, setSkuCode] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [expectedQty, setExpectedQty] = useState("");
  const [actualQty, setActualQty] = useState("");
  const [damageLevel, setDamageLevel] = useState("0");
  const [specDeviation, setSpecDeviation] = useState(false);
  const [labelMatch, setLabelMatch] = useState(true);
  const [batchValid, setBatchValid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [v2Status, setV2Status] = useState<{ healthy: boolean; latency: number; statusCode?: number } | null>(null);
  const [recentScans, setRecentScans] = useState<ScanRecord[]>([]);
  const [resultModal, setResultModal] = useState<{ open: boolean; scan?: ScanRecord; ticket?: ExceptionTicket }>({ open: false });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("v3_current_user");
    if (saved) try { setUser(JSON.parse(saved)); } catch {}
    inputRef.current?.focus();
    fetchRecentScans();
    checkHealth();
    const handler = (e: Event) => setUser((e as CustomEvent).detail);
    window.addEventListener("v3_user_changed", handler);
    return () => window.removeEventListener("v3_user_changed", handler);
  }, []);

  async function checkHealth() {
    const result = await checkV2Health();
    setV2Status(result);
  }

  async function fetchRecentScans() {
    try {
      const res = await fetch("/api/scan?limit=20");
      const data = await res.json();
      if (data.success) setRecentScans(data.data);
    } catch {}
  }

  async function handleScan() {
    if (!skuCode.trim()) { toast.error("请输入 SKU 编码"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalCode: externalCode.trim() || undefined,
          skuCode: skuCode.trim(),
          batchNo: batchNo.trim() || undefined,
          expectedQuantity: expectedQty ? Number(expectedQty) : undefined,
          actualQuantity: actualQty ? Number(actualQty) : undefined,
          damageLevel: Number(damageLevel),
          specDeviation,
          labelMatch,
          batchValid,
          operator: user.name,
          operatorRole: user.role,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data.scan.qcResult === "fail") {
          toast.error(`品控异常：${data.data.scan.failReason || "检测不通过"}`);
        } else {
          toast.success("品控检测通过");
        }
        if (data.data.message) {
          toast(data.data.message, { icon: "⚠️" });
        }
        setResultModal({
          open: true,
          scan: data.data.scan,
          ticket: data.data.ticket,
        });
        setSkuCode(""); setBatchNo("");
        setExpectedQty(""); setActualQty("");
        setDamageLevel("0"); setSpecDeviation(false);
        setLabelMatch(true); setBatchValid(true);
        fetchRecentScans();
        inputRef.current?.focus();
      } else {
        toast.error(data.error || "扫描失败");
      }
    } catch { toast.error("网络错误"); }
    setLoading(false);
  }

  const v2Available = v2Status?.healthy;

  return (
    <div className="page-container animate-fade-in" style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>扫描品控</h2>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 24 }}>
        扫描录入 SKU，品控规则引擎自动检测
        {externalCode && " — 将关联 V2 运单进行 SKU 归属校验"}
      </p>

      {/* V2 连接状态 */}
      <div style={{
        padding: "10px 16px", borderRadius: 8, marginBottom: 20,
        background: v2Available ? "#f6ffed" : "#fff1f0",
        border: `1px solid ${v2Available ? "#b7eb8f" : "#ffccc7"}`,
        fontSize: 13,
      }}>
        V2 系统状态：
        <span style={{ fontWeight: 600, color: v2Available ? "#00a854" : "#cf1322" }}>
          {v2Status ? (v2Available ? "● 正常" : "● 不可用") : "检测中..."}
        </span>
        {v2Status && <span style={{ marginLeft: 8, color: "var(--text-tertiary)" }}>延迟 {v2Status.latency}ms</span>}
        {v2Status && v2Status.statusCode && !v2Available && (
          <span style={{ marginLeft: 4, fontSize: 11, color: "#999" }}>(HTTP {v2Status.statusCode})</span>
        )}
        {!v2Available && v2Status && (
          <span style={{ marginLeft: 8, color: "#d97b00", fontSize: 12 }}>
            {v2Status.statusCode === 408 || v2Status.statusCode === 0
              ? "（网络超时，确认 V2 是否已部署）"
              : "（不填运单号可离线进行品控检测，但不会做 SKU 归属校验）"}
          </span>
        )}
      </div>

      {/* 扫描表单 */}
      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <Field label="V2 运单号" value={externalCode} onChange={setExternalCode} placeholder="如 PS2512220005001（可选，填后做 V2 SKU 归属校验）" />
          <Field label="SKU 编码 *" value={skuCode} onChange={setSkuCode} placeholder="输入或扫描 SKU 编码" ref={inputRef} />
          <Field label="批次号" value={batchNo} onChange={setBatchNo} placeholder="可选" />
          <Field label="预期数量" value={expectedQty} onChange={setExpectedQty} placeholder="运单中数量" type="number" />
          <Field label="实际数量" value={actualQty} onChange={setActualQty} placeholder="扫描实际数量" type="number" />
          <div>
            <label style={labelStyle}>破损等级 (0-5)</label>
            <select value={damageLevel} onChange={(e) => setDamageLevel(e.target.value)}
              style={inputStyle}>
              {[0,1,2,3,4,5].map((n) => <option key={n} value={n}>等级 {n}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>规格偏差</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={specDeviation} onChange={(e) => setSpecDeviation(e.target.checked)} />
              存在规格偏差
            </label>
          </div>
          <div>
            <label style={labelStyle}>标签匹配</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={labelMatch} onChange={(e) => setLabelMatch(e.target.checked)} />
              标签与运单匹配
            </label>
          </div>
          <div>
            <label style={labelStyle}>批次有效性</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={batchValid} onChange={(e) => setBatchValid(e.target.checked)} />
              批次有效
            </label>
          </div>
        </div>
        {externalCode.trim() && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#e8fafa", borderRadius: 6, fontSize: 12, color: "#0bada9" }}>
            ℹ️ 将调用 V2 接口校验运单 {externalCode} 的存在性及其 SKU 归属
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <Button onClick={handleScan} loading={loading}>执行扫描品控</Button>
        </div>
      </div>

      {/* 最近扫描记录 */}
      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "20px 24px" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>最近扫描记录</h3>
        {recentScans.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={thStyle}>时间</th><th style={thStyle}>运单</th><th style={thStyle}>SKU</th><th style={thStyle}>批次</th><th style={thStyle}>结果</th><th style={thStyle}>批次状态</th><th style={thStyle}>规则</th>
            </tr></thead>
            <tbody>
              {recentScans.map((s) => (
                <tr key={s.id} className="table-row-hover" style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={tdStyle}>{new Date(s.scanTime).toLocaleString()}</td>
                  <td style={tdStyle}>{s.externalCode || "-"}</td>
                  <td style={tdStyle}><code>{s.skuCode}</code></td>
                  <td style={tdStyle}>{s.batchNo || "-"}</td>
                  <td style={tdStyle}><StatusDot status={s.qcResult} label={s.qcResult === "pass" ? "通过" : "异常"} /></td>
                  <td style={tdStyle}>
                    <StatusDot status={s.batchStatus}
                      label={s.batchStatus === "normal" ? "正常" : s.batchStatus === "qc_hold" ? "品控暂扣" : "已放行"} />
                  </td>
                  <td style={tdStyle}>{s.triggeredRuleName || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: "center", padding: 20, color: "var(--text-tertiary)" }}>暂无扫描记录</div>
        )}
      </div>

      {/* 结果弹窗 */}
      <Modal open={resultModal.open} onClose={() => setResultModal({ open: false })} title="扫描结果">
        {resultModal.scan && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: resultModal.scan.qcResult === "pass" ? "#f6ffed" : "#fff1f0", borderRadius: 8 }}>
              <span style={{ fontWeight: 600 }}>品控结果</span>
              <StatusDot status={resultModal.scan.qcResult} label={resultModal.scan.qcResult === "pass" ? "通过" : "不通过"} />
            </div>
            <div><strong>SKU：</strong>{resultModal.scan.skuCode}</div>
            {resultModal.scan.externalCode && <div><strong>运单：</strong>{resultModal.scan.externalCode}</div>}
            {resultModal.scan.failReason && <div><strong>原因：</strong>{resultModal.scan.failReason}</div>}
            {resultModal.scan.triggeredRuleName && <div><strong>触发规则：</strong>{resultModal.scan.triggeredRuleName}</div>}
            <div>
              <strong>批次状态：</strong>
              <StatusDot status={resultModal.scan.batchStatus}
                label={resultModal.scan.batchStatus === "normal" ? "正常" : resultModal.scan.batchStatus === "qc_hold" ? "品控暂扣" : "已放行"} />
            </div>
            {resultModal.ticket && (
              <div style={{ padding: 12, background: "#e8fafa", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: "#0fc6c2" }}>已自动创建异常工单</div>
                <div style={{ marginTop: 4, fontSize: 14 }}>工单号：{resultModal.ticket.ticketNo}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", ref }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; ref?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input ref={ref as React.RefObject<HTMLInputElement>} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, outline: "none" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };
