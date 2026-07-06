"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { StatusDot } from "@/components/ui/TableDecorations";
import { ExceptionTicket, TicketStatus, EXCEPTION_TYPE_LABELS, TICKET_STATUS_LABELS, LOGISTICS_EXCEPTION_TYPES, QC_EXCEPTION_TYPES } from "@/types";
import { getStatusColor, isApproachingTimeout } from "@/lib/utils";
import { checkV2Health } from "@/lib/v2-client";

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<{
    total: number; byStatus: Record<string, number>;
    bySource: Record<string, number>; byTypeCategory: { logistics: number; qc: number };
    recent: ExceptionTicket[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [v2Health, setV2Health] = useState<{ healthy: boolean; latency: number; statusCode?: number } | null>(null);

  useEffect(() => {
    Promise.all([fetchStats(), checkV2Health().then(setV2Health)]);
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets?pageSize=200");
      const data = await res.json();
      if (data.success) {
        const tickets: ExceptionTicket[] = data.data.tickets;
        const byStatus: Record<string, number> = {};
        const bySource: Record<string, number> = {};
        let logisticsCount = 0;
        let qcCount = 0;

        tickets.forEach((t) => {
          byStatus[t.status] = (byStatus[t.status] || 0) + 1;
          bySource[t.exceptionSource] = (bySource[t.exceptionSource] || 0) + 1;
          if (LOGISTICS_EXCEPTION_TYPES.includes(t.exceptionType)) logisticsCount++;
          if (QC_EXCEPTION_TYPES.includes(t.exceptionType)) qcCount++;
        });
        setStats({
          total: data.data.total,
          byStatus,
          bySource,
          byTypeCategory: { logistics: logisticsCount, qc: qcCount },
          recent: tickets.slice(0, 10),
        });
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  if (loading) return <Spinner />;

  const statusCards: { status: TicketStatus; label: string; icon: string }[] = [
    { status: "pending", label: "待审批", icon: "⏳" },
    { status: "level1_review", label: "一级审批", icon: "📝" },
    { status: "level2_review", label: "二级审批", icon: "🔍" },
    { status: "executing", label: "执行中", icon: "⚡" },
    { status: "completed", label: "已完成", icon: "✅" },
  ];

  return (
    <div className="page-container animate-fade-in" style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>工作台</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>运单全流程管理 V3 — 独立部署系统</p>
      </div>

      {/* V2 连接状态 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        padding: "10px 16px", borderRadius: 8,
        background: v2Health?.healthy ? "#f6ffed" : "#fff1f0",
        border: `1px solid ${v2Health?.healthy ? "#b7eb8f" : "#ffccc7"}`,
        fontSize: 13,
      }}>
        <span>V2 系统：
          <span style={{ fontWeight: 600, color: v2Health?.healthy ? "#00a854" : "#cf1322" }}>
            {!v2Health ? "检测中..." : v2Health.healthy ? "● 正常" : `● 不可用`}
          </span>
          {v2Health && <span style={{ marginLeft: 8, color: "var(--text-tertiary)" }}>延迟 {v2Health.latency}ms</span>}
          {v2Health && v2Health.statusCode && !v2Health.healthy && (
            <span style={{ marginLeft: 4, fontSize: 11, color: "#999" }}>
              (HTTP {v2Health.statusCode})
            </span>
          )}
        </span>
        {v2Health && !v2Health.healthy && (
          <span style={{ color: "#d97b00", fontSize: 12 }}>
            {v2Health.statusCode === 408 || v2Health.statusCode === 0
              ? "（网络超时，请确认 V2 服务是否已部署）"
              : v2Health.statusCode === 401
                ? "（Key 不匹配，请检查 V2_API_KEY 环境变量）"
                : "（异常上报需 V2 实时校验）"}
          </span>
        )}
      </div>

      {/* 快速入口 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <Button onClick={() => router.push("/scan")}>📷 扫描品控</Button>
        <Button variant="outline" onClick={() => router.push("/tickets/new")}>📝 异常上报</Button>
        <Button variant="outline" onClick={() => router.push("/tickets")}>📋 工单列表</Button>
        <Button variant="outline" onClick={() => router.push("/approvals")}>✓ 审批中心</Button>
        <Button variant="outline" onClick={() => router.push("/monitor")}>↻ 同步监控</Button>
      </div>

      {/* 概览统计 */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 16, marginBottom: 24,
      }}>
        <div className="card-enhanced animate-slide-up"
          style={{ background: "white", borderRadius: 12, padding: "16px 20px", cursor: "pointer" }}
          onClick={() => router.push("/tickets")}
        >
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>总工单</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0fc6c2" }}>{stats?.total || 0}</div>
        </div>
        <div className="card-enhanced animate-slide-up"
          style={{ background: "white", borderRadius: 12, padding: "16px 20px" }}
        >
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>物流异常</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#1890ff" }}>{stats?.byTypeCategory.logistics || 0}</div>
        </div>
        <div className="card-enhanced animate-slide-up"
          style={{ background: "white", borderRadius: 12, padding: "16px 20px" }}
        >
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>品控异常</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0fc6c2" }}>{stats?.byTypeCategory.qc || 0}</div>
        </div>
        <div className="card-enhanced animate-slide-up"
          style={{ background: "white", borderRadius: 12, padding: "16px 20px" }}
        >
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>手工上报</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#1890ff" }}>{stats?.bySource.manual || 0}</div>
        </div>
        <div className="card-enhanced animate-slide-up"
          style={{ background: "white", borderRadius: 12, padding: "16px 20px" }}
        >
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>扫描触发</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0fc6c2" }}>{stats?.bySource.scan_trigger || 0}</div>
        </div>
      </div>

      {/* 状态统计卡片 */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 16, marginBottom: 24,
      }}>
        {statusCards.map((card) => (
          <div key={card.status} className="card-enhanced animate-slide-up"
            style={{ background: "white", borderRadius: 12, padding: "16px 20px", cursor: "pointer" }}
            onClick={() => router.push(`/tickets?status=${card.status}`)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 24 }}>{card.icon}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: getStatusColor(card.status) }}>
                {stats?.byStatus[card.status] || 0}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* 最近工单 */}
      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "20px 24px" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>最近工单</h3>
        {stats?.recent && stats.recent.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={thStyle}>工单号</th><th style={thStyle}>异常类型</th><th style={thStyle}>来源</th>
                <th style={thStyle}>金额</th><th style={thStyle}>状态</th><th style={thStyle}>上报人</th>
                <th style={thStyle}>超时</th><th style={thStyle}>时间</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((t) => {
                const approaching = isApproachingTimeout(t.timeoutAt);
                return (
                  <tr key={t.id} className="table-row-hover"
                    style={{
                      borderBottom: "1px solid var(--border-light)", cursor: "pointer",
                      background: approaching ? "#fffbe6" : "transparent",
                    }}
                    onClick={() => router.push(`/tickets/${t.id}`)}
                  >
                    <td style={tdStyle}><span style={{ color: "#0fc6c2", fontWeight: 500 }}>{t.ticketNo}</span></td>
                    <td style={tdStyle}>{EXCEPTION_TYPE_LABELS[t.exceptionType] || t.exceptionType}</td>
                    <td style={tdStyle}>
                      <StatusDot status={t.exceptionSource} label={t.exceptionSource === "manual" ? "手工上报" : "扫描触发"} />
                    </td>
                    <td style={tdStyle}>¥{t.amount.toFixed(2)}</td>
                    <td style={tdStyle}><StatusDot status={t.status} label={TICKET_STATUS_LABELS[t.status] || t.status} /></td>
                    <td style={tdStyle}>{t.reporter}</td>
                    <td style={tdStyle}>
                      {approaching
                        ? <span style={{ color: "#d97b00", fontSize: 12 }}>⏰即将超时</span>
                        : t.timeoutAt
                          ? <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{new Date(t.timeoutAt).toLocaleString()}</span>
                          : "-"}
                    </td>
                    <td style={tdStyle}>{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
            暂无数据，请前往「工单管理」页面点击「生成模拟数据」
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };
