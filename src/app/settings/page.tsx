"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import { QCRule, EXCEPTION_TYPE_LABELS, ExceptionType, QC_EXCEPTION_TYPES } from "@/types";

export default function SettingsPage() {
  const [rules, setRules] = useState<QCRule[]>([]);
  const [configs, setConfigs] = useState<{ key: string; value: string; desc: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "", exceptionSubType: "qc_quantity" as ExceptionType,
    conditionField: "quantity_diff_percent", conditionOperator: "gt" as QCRule["conditionOperator"],
    conditionValue: "", severity: "medium" as QCRule["severity"],
    approvalLevel: 1,
  });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [rulesRes, configsRes] = await Promise.all([
        fetch("/api/qc-rules"),
        fetch("/api/config"),
      ]);
      const rulesData = await rulesRes.json();
      const configsData = await configsRes.json();
      if (rulesData.success) setRules(rulesData.data);
      if (configsData.success) setConfigs(configsData.data);
    } catch {}
    setLoading(false);
  }

  async function addRule() {
    if (!newRule.name || !newRule.conditionValue) { toast.error("请填写完整信息"); return; }
    try {
      const res = await fetch("/api/qc-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRule),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("规则已添加");
        setShowRuleModal(false);
        setNewRule({ name: "", exceptionSubType: "qc_quantity", conditionField: "quantity_diff_percent", conditionOperator: "gt", conditionValue: "", severity: "medium", approvalLevel: 1 });
        fetchData();
      } else { toast.error(data.error || "添加失败"); }
    } catch { toast.error("网络错误"); }
  }

  async function deleteRule(id: string) {
    try {
      const res = await fetch(`/api/qc-rules?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { toast.success("已删除"); fetchData(); }
      else { toast.error("删除失败"); }
    } catch { toast.error("网络错误"); }
  }

  async function updateConfig(key: string, value: string) {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      setConfigs((prev) => prev.map((c) => c.key === key ? { ...c, value } : c));
      toast.success("配置已更新");
    } catch { toast.error("更新失败"); }
  }

  if (loading) return <Spinner />;

  return (
    <div className="page-container animate-fade-in" style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>规则配置</h2>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 24 }}>品控规则、审批阈值均可配置调整</p>

      {/* 系统配置 */}
      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>系统配置</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {configs.map((c) => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", minWidth: 120 }}>{c.desc || c.key}</label>
              <input
                type="text" value={c.value}
                onChange={(e) => setConfigs((prev) => prev.map((x) => x.key === c.key ? { ...x, value: e.target.value } : x))}
                style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, outline: "none" }}
              />
              <Button size="sm" onClick={() => updateConfig(c.key, c.value)}>保存</Button>
            </div>
          ))}
        </div>
      </div>

      {/* 品控规则 */}
      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>品控规则</h3>
          <Button onClick={() => setShowRuleModal(true)}>+ 添加规则</Button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={thStyle}>规则名称</th><th style={thStyle}>异常子类型</th><th style={thStyle}>条件</th>
              <th style={thStyle}>严重度</th><th style={thStyle}>审批层级</th><th style={thStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="table-row-hover" style={{ borderBottom: "1px solid var(--border-light)" }}>
                <td style={tdStyle}>{r.name}</td>
                <td style={tdStyle}>{EXCEPTION_TYPE_LABELS[r.exceptionSubType]}</td>
                <td style={tdStyle}>
                  <code>{r.conditionField} {r.conditionOperator} {r.conditionValue}</code>
                </td>
                <td style={tdStyle}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 12,
                    background: r.severity === "critical" ? "#fff1f0" : r.severity === "high" ? "#fffbe6" : "#f6ffed",
                    color: r.severity === "critical" ? "#cf1322" : r.severity === "high" ? "#d97b00" : "#00a854",
                  }}>{r.severity}</span>
                </td>
                <td style={tdStyle}>{r.approvalLevel}级</td>
                <td style={tdStyle}>
                  <span style={{ color: "#cf1322", cursor: "pointer", fontSize: 12 }}
                    onClick={() => deleteRule(r.id)}>删除</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 添加规则弹窗 */}
      <Modal open={showRuleModal} onClose={() => setShowRuleModal(false)} title="添加品控规则" width={500}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={lbl}>规则名称 *</label>
            <input value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
              placeholder="如：数量差异超过30%" style={inp} />
          </div>
          <div>
            <label style={lbl}>异常子类型</label>
            <select value={newRule.exceptionSubType} onChange={(e) => setNewRule({ ...newRule, exceptionSubType: e.target.value as ExceptionType })}
              style={inp}>
              {QC_EXCEPTION_TYPES.map((t) => <option key={t} value={t}>{EXCEPTION_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", gap: 8 }}>
            <div>
              <label style={lbl}>条件字段</label>
              <select value={newRule.conditionField} onChange={(e) => setNewRule({ ...newRule, conditionField: e.target.value })}
                style={inp}>
                <option value="quantity_diff_percent">数量差异%</option>
                <option value="damage_level">破损等级</option>
                <option value="spec_deviation">规格偏差</option>
                <option value="label_match">标签匹配</option>
                <option value="batch_valid">批次有效</option>
              </select>
            </div>
            <div>
              <label style={lbl}>操作符</label>
              <select value={newRule.conditionOperator} onChange={(e) => setNewRule({ ...newRule, conditionOperator: e.target.value as QCRule["conditionOperator"] })}
                style={inp}>
                <option value="gt">&gt;</option><option value="gte">&gt;=</option>
                <option value="lt">&lt;</option><option value="lte">&lt;=</option>
                <option value="eq">=</option><option value="neq">!=</option>
              </select>
            </div>
            <div>
              <label style={lbl}>阈值 *</label>
              <input value={newRule.conditionValue} onChange={(e) => setNewRule({ ...newRule, conditionValue: e.target.value })}
                placeholder="如：30" style={inp} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={lbl}>严重度</label>
              <select value={newRule.severity} onChange={(e) => setNewRule({ ...newRule, severity: e.target.value as QCRule["severity"] })}
                style={inp}>
                <option value="low">低</option><option value="medium">中</option>
                <option value="high">高</option><option value="critical">严重</option>
              </select>
            </div>
            <div>
              <label style={lbl}>审批层级</label>
              <select value={newRule.approvalLevel} onChange={(e) => setNewRule({ ...newRule, approvalLevel: Number(e.target.value) })}
                style={inp}>
                <option value={1}>一级审批</option><option value={2}>二级审批</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button variant="outline" onClick={() => setShowRuleModal(false)}>取消</Button>
            <Button onClick={addRule}>添加规则</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, outline: "none" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 14px", fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "10px 14px", fontSize: 13 };
