"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { StatusDot } from "@/components/ui/TableDecorations";
import Modal from "@/components/ui/Modal";
import { ExceptionTicket, TICKET_STATUS_LABELS, EXCEPTION_TYPE_LABELS, CurrentUser, MOCK_USERS } from "@/types";
import { formatDateTime, isApproachingTimeout } from "@/lib/utils";

export default function ApprovalsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<ExceptionTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<CurrentUser>(MOCK_USERS[4]);
  const [showModal, setShowModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<ExceptionTicket | null>(null);
  const [opinion, setOpinion] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("v3_current_user");
    if (saved) try { setUser(JSON.parse(saved)); } catch {}
    fetchTickets();
    const handler = (e: Event) => setUser((e as CustomEvent).detail);
    window.addEventListener("v3_user_changed", handler);
    return () => window.removeEventListener("v3_user_changed", handler);
  }, []);

  async function fetchTickets() {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets?pageSize=200");
      const data = await res.json();
      if (data.success) {
        // 过滤出当前用户需要审批的工单
        const all: ExceptionTicket[] = data.data.tickets;
        const filtered = all.filter((t) => {
          if (["completed", "rejected_final", "executing"].includes(t.status)) return false;
          if (t.reporter === user.name) return false;
          if (user.role === "admin") return true;
          if (user.role === "level2_approver") return true;
          if (user.role === "level1_approver" && ["pending", "level1_review"].includes(t.status) && t.amount <= 5000) return true;
          return false;
        });
        setTickets(filtered);
      }
    } catch {}
    setLoading(false);
  }

  async function handleApproval(action: "approve" | "reject") {
    if (!selectedTicket) return;
    if (!opinion.trim()) { toast.error("请填写审批意见"); return; }
    setActionLoading(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          action,
          opinion: opinion.trim(),
          approver: user.name,
          approverRole: user.role,
          level: selectedTicket.status === "level2_review" ? 2 : 1,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(action === "approve" ? "审批通过" : "已拒绝");
        setShowModal(false);
        setOpinion("");
        fetchTickets();
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch { toast.error("网络错误"); }
    setActionLoading(false);
  }

  if (loading) return <Spinner />;

  return (
    <div className="page-container animate-fade-in" style={{ padding: "24px 28px", maxWidth: 1400 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>审批中心</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>
          待审批工单：{tickets.length} 条 | 当前角色：{user.name}
        </p>
      </div>

      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa", borderBottom: "1px solid var(--border)" }}>
              <th style={thStyle}>工单号</th><th style={thStyle}>类型</th><th style={thStyle}>金额</th>
              <th style={thStyle}>状态</th><th style={thStyle}>上报人</th><th style={thStyle}>时间</th>
              <th style={thStyle}>超时</th><th style={thStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const approaching = isApproachingTimeout(t.timeoutAt);
              return (
                <tr key={t.id} className="table-row-hover"
                  style={{ borderBottom: "1px solid var(--border-light)", background: approaching ? "#fffbe6" : "transparent" }}>
                  <td style={tdStyle}>
                    <span style={{ color: "#0fc6c2", fontWeight: 500, cursor: "pointer" }}
                      onClick={() => router.push(`/tickets/${t.id}`)}>{t.ticketNo}</span>
                  </td>
                  <td style={tdStyle}>{EXCEPTION_TYPE_LABELS[t.exceptionType]}</td>
                  <td style={tdStyle}>¥{t.amount.toFixed(2)}</td>
                  <td style={tdStyle}><StatusDot status={t.status} label={TICKET_STATUS_LABELS[t.status]} /></td>
                  <td style={tdStyle}>{t.reporter}</td>
                  <td style={tdStyle}>{formatDateTime(t.createdAt)}</td>
                  <td style={tdStyle}>
                    {approaching ? <span style={{ color: "#d97b00", fontSize: 12 }}>⏰即将超时</span> :
                     t.timeoutAt ? <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{formatDateTime(t.timeoutAt)}</span> : "-"}
                  </td>
                  <td style={tdStyle}>
                    <Button size="sm" onClick={() => { setSelectedTicket(t); setShowModal(true); }}>审批</Button>
                  </td>
                </tr>
              );
            })}
            {tickets.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>暂无待审批工单</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 审批弹窗 */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="审批工单"
        width={500}>
        {selectedTicket && (
          <div>
            <div style={{ marginBottom: 16, padding: 12, background: "#f7f8fa", borderRadius: 8, fontSize: 13 }}>
              <div><strong>工单号：</strong>{selectedTicket.ticketNo}</div>
              <div><strong>类型：</strong>{EXCEPTION_TYPE_LABELS[selectedTicket.exceptionType]}</div>
              <div><strong>金额：</strong>¥{selectedTicket.amount.toFixed(2)}</div>
              <div><strong>描述：</strong>{selectedTicket.description.slice(0, 100)}...</div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>审批意见 *</label>
              <textarea value={opinion} onChange={(e) => setOpinion(e.target.value)}
                placeholder="请填写审批意见..."
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, minHeight: 80, resize: "vertical", outline: "none" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Button variant="outline" onClick={() => setShowModal(false)}>取消</Button>
              <Button variant="danger" onClick={() => handleApproval("reject")} loading={actionLoading}>拒绝</Button>
              <Button onClick={() => handleApproval("approve")} loading={actionLoading}>审批通过</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "12px 16px", fontSize: 13 };
