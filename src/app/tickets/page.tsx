"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { StatusDot } from "@/components/ui/TableDecorations";
import { ExceptionTicket, EXCEPTION_TYPE_LABELS, TICKET_STATUS_LABELS } from "@/types";
import { isApproachingTimeout } from "@/lib/utils";

function TicketListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<ExceptionTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: searchParams.get("status") || "",
    exceptionType: "",
    exceptionSource: "",
    waybillCode: "",
  });

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.exceptionType) params.set("exceptionType", filters.exceptionType);
      if (filters.exceptionSource) params.set("exceptionSource", filters.exceptionSource);
      if (filters.waybillCode) params.set("waybillCode", filters.waybillCode);
      params.set("page", String(page));
      params.set("pageSize", "20");

      const res = await fetch(`/api/tickets?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setTickets(data.data.tickets);
        setTotal(data.data.total);
      }
    } catch { toast.error("加载失败"); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  async function generateMockData() {
    try {
      const res = await fetch("/api/mock-data", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`已生成 ${data.data.count} 条模拟工单`);
        fetchTickets();
      } else {
        toast.error(data.error || "生成失败");
      }
    } catch { toast.error("生成失败"); }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="page-container animate-fade-in" style={{ padding: "24px 28px", maxWidth: 1400 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>工单管理</h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>共 {total} 条工单</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" onClick={generateMockData}>生成模拟数据</Button>
          <Button onClick={() => router.push("/tickets/new")}>+ 异常上报</Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
          style={selectStyle}>
          <option value="">全部状态</option>
          {Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.exceptionType} onChange={(e) => { setFilters({ ...filters, exceptionType: e.target.value }); setPage(1); }}
          style={selectStyle}>
          <option value="">全部类型</option>
          {Object.entries(EXCEPTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.exceptionSource} onChange={(e) => { setFilters({ ...filters, exceptionSource: e.target.value }); setPage(1); }}
          style={selectStyle}>
          <option value="">全部来源</option>
          <option value="manual">手工上报</option>
          <option value="scan_trigger">扫描触发</option>
        </select>
        <input type="text" placeholder="搜索运单号..." value={filters.waybillCode}
          onChange={(e) => { setFilters({ ...filters, waybillCode: e.target.value }); setPage(1); }}
          style={{ ...selectStyle, width: 180 }} />
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="card-enhanced" style={{ background: "white", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafafa", borderBottom: "1px solid var(--border)" }}>
                  <th style={thStyle}>工单号</th>
                  <th style={thStyle}>异常类型</th>
                  <th style={thStyle}>来源</th>
                  <th style={thStyle}>金额</th>
                  <th style={thStyle}>状态</th>
                  <th style={thStyle}>上报人</th>
                  <th style={thStyle}>时间</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const approaching = isApproachingTimeout(t.timeoutAt);
                  return (
                    <tr key={t.id} className="table-row-hover"
                      style={{
                        borderBottom: "1px solid var(--border-light)",
                        background: approaching ? "#fffbe6" : "transparent",
                      }}
                    >
                      <td style={tdStyle}>
                        <span style={{ color: "#0fc6c2", fontWeight: 500, cursor: "pointer" }}
                          onClick={() => router.push(`/tickets/${t.id}`)}>
                          {t.ticketNo}
                        </span>
                        {approaching && <span style={{ marginLeft: 6, fontSize: 11, color: "#d97b00" }}>⏰即将超时</span>}
                      </td>
                      <td style={tdStyle}>{EXCEPTION_TYPE_LABELS[t.exceptionType] || t.exceptionType}</td>
                      <td style={tdStyle}>
                        <StatusDot status={t.exceptionSource} label={t.exceptionSource === "manual" ? "手工上报" : "扫描触发"} />
                      </td>
                      <td style={tdStyle}>¥{t.amount.toFixed(2)}</td>
                      <td style={tdStyle}><StatusDot status={t.status} label={TICKET_STATUS_LABELS[t.status]} /></td>
                      <td style={tdStyle}>{t.reporter}</td>
                      <td style={tdStyle}>{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <span style={{ color: "#0fc6c2", cursor: "pointer", fontSize: 13 }}
                          onClick={() => router.push(`/tickets/${t.id}`)}>查看详情 →</span>
                      </td>
                    </tr>
                  );
                })}
                {tickets.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
              <span style={{ padding: "4px 12px", fontSize: 13, color: "var(--text-secondary)" }}>第 {page}/{totalPages} 页</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TicketListPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <TicketListContent />
    </Suspense>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 13, outline: "none", background: "white", minWidth: 120,
};
const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "12px 16px", fontSize: 13 };
