"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import { StatusDot } from "@/components/ui/TableDecorations";
import {
  ExceptionTicket, ApprovalRecord, CurrentUser, MOCK_USERS,
  TICKET_STATUS_LABELS, EXCEPTION_TYPE_LABELS,
} from "@/types";
import { formatDateTime } from "@/lib/utils";

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<ExceptionTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<CurrentUser>(MOCK_USERS[4]);
  const [actionLoading, setActionLoading] = useState(false);
  const [opinion, setOpinion] = useState("");
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveAction, setApproveAction] = useState<"approve" | "reject">("approve");
  const [showFastReleaseModal, setShowFastReleaseModal] = useState(false);
  const [fastReleaseReason, setFastReleaseReason] = useState("");
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("v3_current_user");
    if (saved) try { setUser(JSON.parse(saved)); } catch {}
    fetchTicket();
  }, [ticketId]);

  async function fetchTicket() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      const data = await res.json();
      if (data.success) setTicket(data.data);
      else toast.error("工单不存在");
    } catch { toast.error("加载失败"); }
    setLoading(false);
  }

  function canApprove(): boolean {
    if (!ticket || !user) return false;
    if (user.role === "operator" || user.role === "qc_supervisor") return false;
    if (ticket.reporter === user.name) return false;
    if (ticket.status === "pending" && (user.role === "level1_approver" || user.role === "admin" || user.role === "level2_approver")) return true;
    if (ticket.status === "level1_review" && (user.role === "level1_approver" || user.role === "admin")) return true;
    if (ticket.status === "level2_review" && (user.role === "level2_approver" || user.role === "admin")) return true;
    return false;
  }

  function canFastRelease(): boolean {
    if (!ticket || !user) return false;
    return (user.role === "qc_supervisor" || user.role === "admin") && ticket.exceptionSource === "scan_trigger" && ["pending", "level1_review", "level2_review"].includes(ticket.status);
  }

  function canExecute(): boolean {
    if (!ticket || !user) return false;
    return ticket.status === "executing" && (user.role === "admin" || user.role === "operator");
  }

  async function handleApproval() {
    if (!opinion.trim()) { toast.error("请填写审批意见"); return; }
    setActionLoading(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket!.id,
          action: approveAction,
          opinion: opinion.trim(),
          approver: user.name,
          approverRole: user.role,
          level: ticket!.status === "level2_review" ? 2 : 1,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(approveAction === "approve" ? "审批通过" : "已拒绝");
        setShowApproveModal(false);
        setOpinion("");
        fetchTicket();
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch { toast.error("网络错误"); }
    setActionLoading(false);
  }

  async function handleFastRelease() {
    if (!fastReleaseReason.trim()) { toast.error("请填写复核原因"); return; }
    setActionLoading(true);
    try {
      const res = await fetch("/api/scan/fast-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket!.id,
          reason: fastReleaseReason.trim(),
          operator: user.name,
          operatorRole: user.role,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("快速放行成功");
        setShowFastReleaseModal(false);
        setFastReleaseReason("");
        fetchTicket();
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch { toast.error("网络错误"); }
    setActionLoading(false);
  }

  async function handleExecute() {
    setExecuting(true);
    try {
      const res = await fetch("/api/execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket!.id, operator: user.name }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("执行完成");
        fetchTicket();
      } else {
        toast.error(data.error || "执行失败");
      }
    } catch { toast.error("网络错误"); }
    setExecuting(false);
  }

  if (loading) return <Spinner />;
  if (!ticket) return <div style={{ textAlign: "center", padding: 60, color: "var(--text-tertiary)" }}>工单不存在</div>;

  return (
    <div className="page-container animate-fade-in" style={{ padding: "24px 28px", maxWidth: 1000 }}>
      <div style={{ marginBottom: 20 }}>
        <Button variant="ghost" size="sm" onClick={() => router.back()}>← 返回列表</Button>
      </div>

      {/* 工单头部 */}
      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "24px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>工单 {ticket.ticketNo}</h2>
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <StatusDot status={ticket.status} label={TICKET_STATUS_LABELS[ticket.status]} />
              <StatusDot status={ticket.exceptionSource} label={ticket.exceptionSource === "manual" ? "手工上报" : "扫描触发"} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>|</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{EXCEPTION_TYPE_LABELS[ticket.exceptionType]}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {canFastRelease() && (
              <Button variant="outline" onClick={() => setShowFastReleaseModal(true)}>
                ⚡ 误判快速放行
              </Button>
            )}
            {canApprove() && (
              <>
                <Button variant="outline" onClick={() => { setApproveAction("reject"); setShowApproveModal(true); }}>
                  ✕ 拒绝
                </Button>
                <Button onClick={() => { setApproveAction("approve"); setShowApproveModal(true); }}>
                  ✓ 通过
                </Button>
              </>
            )}
            {canExecute() && (
              <Button onClick={handleExecute} loading={executing}>
                ⚡ 执行联动
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 基本信息 */}
      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "24px", marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>基本信息</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <InfoRow label="异常类型" value={EXCEPTION_TYPE_LABELS[ticket.exceptionType]} />
          <InfoRow label="上报来源" value={ticket.exceptionSource === "manual" ? "手工上报" : "扫描触发"} />
          <InfoRow label="涉及金额" value={`¥${ticket.amount.toFixed(2)}`} />
          <InfoRow label="上报人" value={ticket.reporter} />
          <InfoRow label="重提次数" value={`${ticket.rejectCount}/${ticket.maxRejectCount}`} />
          <InfoRow label="创建时间" value={formatDateTime(ticket.createdAt)} />
          {ticket.timeoutAt && <InfoRow label="超时时间" value={formatDateTime(ticket.timeoutAt)} />}
          {ticket.executionAction && <InfoRow label="执行动作" value={ticket.executionAction} />}
        </div>
        {ticket.description && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>异常描述</div>
            <div style={{ padding: "10px 14px", background: "#f7f8fa", borderRadius: 8, fontSize: 13, lineHeight: 1.8 }}>
              {ticket.description}
            </div>
          </div>
        )}
        {/* 运单快照信息 */}
        {ticket.waybillSnapshot && (
          <div style={{ marginTop: 16, padding: "12px", background: "#f7f8fa", borderRadius: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
            📋 关联运单：{ticket.waybillSnapshot.externalCode || ticket.waybillSnapshot.waybillId}
            | 收件人：{ticket.waybillSnapshot.recipientName || "-"}
            <span style={{ marginLeft: 8, fontStyle: "italic" }}>
              （数据来源：本地缓存，同步于 {formatDateTime(ticket.waybillSnapshot.syncedAt)}）
            </span>
          </div>
        )}
      </div>

      {/* 审批记录 / 状态变更历史 */}
      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "24px", marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>审批记录 / 状态变更历史</h3>
        {ticket.approvalRecords && ticket.approvalRecords.length > 0 ? (
          <div style={{ position: "relative", paddingLeft: 20 }}>
            <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 2, background: "var(--border)" }} />
            {ticket.approvalRecords.map((record: ApprovalRecord) => (
              <div key={record.id} style={{ marginBottom: 16, position: "relative" }}>
                <div style={{
                  position: "absolute", left: -26, top: 4,
                  width: 12, height: 12, borderRadius: "50%",
                  background: record.action === "approve" ? "#00a854" : record.action === "reject" ? "#cf1322" : "#fa8c16",
                  border: "2px solid white",
                }} />
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{record.approver}</span>
                  <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>
                    {record.level === 1 ? "一级" : "二级"}
                    {record.action === "approve" ? "审批通过" : record.action === "reject" ? "审批拒绝" : "升级"}
                  </span>
                  {record.triggeredBy === "auto_timeout" && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "#d97b00", fontWeight: 500 }}>（超时自动触发）</span>
                  )}
                  {record.triggeredBy === "auto_escalation" && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "#722ed1", fontWeight: 500 }}>（自动升级）</span>
                  )}
                </div>
                {record.opinion && (
                  <div style={{ marginTop: 4, padding: "6px 12px", background: "#f7f8fa", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                    &ldquo;{record.opinion}&rdquo;
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {formatDateTime(record.createdAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 20, color: "var(--text-tertiary)", fontSize: 13 }}>暂无审批记录</div>
        )}
      </div>

      {/* 赔付记录 */}
      {ticket.compensationRecord && (
        <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "24px" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>赔付记录</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
            <InfoRow label="赔付方向" value={ticket.compensationRecord.compensationDirection === "to_customer" ? "赔付客户" : "向供应商追偿"} />
            <InfoRow label="赔付金额" value={`¥${ticket.compensationRecord.amount.toFixed(2)}`} />
            <InfoRow label="状态" value={ticket.compensationRecord.status === "processed" ? "已处理" : "待处理"} />
            <InfoRow label="创建时间" value={formatDateTime(ticket.compensationRecord.createdAt)} />
            {ticket.compensationRecord.description && <InfoRow label="说明" value={ticket.compensationRecord.description} />}
          </div>
        </div>
      )}

      {/* 审批弹窗 */}
      <Modal open={showApproveModal} onClose={() => setShowApproveModal(false)}
        title={approveAction === "approve" ? "审批通过" : "审批拒绝"}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>审批意见 *</label>
          <textarea
            value={opinion}
            onChange={(e) => setOpinion(e.target.value)}
            placeholder="请填写审批意见..."
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, minHeight: 80, resize: "vertical", outline: "none" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <Button variant="outline" onClick={() => setShowApproveModal(false)}>取消</Button>
            <Button onClick={handleApproval} loading={actionLoading} variant={approveAction === "reject" ? "danger" : "primary"}>
              {approveAction === "approve" ? "确认通过" : "确认拒绝"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 快速放行弹窗 */}
      <Modal open={showFastReleaseModal} onClose={() => setShowFastReleaseModal(false)}
        title="误判快速放行（品控主管操作）">
        <div>
          <div style={{ padding: 10, background: "#fffbe6", borderRadius: 6, fontSize: 12, color: "#d97b00", marginBottom: 16 }}>
            ⚠️ 快速放行将跳过审批流程直接解锁批次，操作需留痕。
          </div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>复核原因 *</label>
          <textarea
            value={fastReleaseReason}
            onChange={(e) => setFastReleaseReason(e.target.value)}
            placeholder="请说明为何认定为误判..."
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, minHeight: 80, resize: "vertical", outline: "none" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <Button variant="outline" onClick={() => setShowFastReleaseModal(false)}>取消</Button>
            <Button onClick={handleFastRelease} loading={actionLoading} variant="primary">
              确认快速放行
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "var(--text-tertiary)", marginRight: 8 }}>{label}：</span>
      <span style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
