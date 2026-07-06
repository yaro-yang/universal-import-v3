"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { checkV2Health } from "@/lib/v2-client";
import { ApiSyncLog } from "@/types";
import { formatDateTime } from "@/lib/utils";

export default function MonitorPage() {
  const [v2Health, setV2Health] = useState<{ healthy: boolean; latency: number; statusCode?: number } | null>(null);
  const [stats, setStats] = useState<{
    totalCalls: number; successCalls: number; failedCalls: number;
    lastSyncTime: string | null; successRate: number; recentLogs: ApiSyncLog[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [v2ApiUrl, setV2ApiUrl] = useState("");

  useEffect(() => {
    setV2ApiUrl(process.env.NEXT_PUBLIC_V2_API_URL || "https://universal-import-v2.vercel.app/api/v2/external");
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [health, monitorRes] = await Promise.all([
        checkV2Health(),
        fetch("/api/monitor"),
      ]);
      setV2Health(health);
      const data = await monitorRes.json();
      if (data.success) setStats(data.data);
    } catch {}
    setLoading(false);
  }

  if (loading) return <Spinner />;

  return (
    <div className="page-container animate-fade-in" style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>同步监控</h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>V2 接口状态与同步日志</p>
        </div>
        <Button variant="outline" onClick={fetchData}>刷新</Button>
      </div>

      {/* V2 状态卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "20px" }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>V2 服务状态</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: v2Health?.healthy ? "#00a854" : "#cf1322" }}>
            {v2Health?.healthy ? "● 正常" : "● 不可用"}
          </div>
          {v2Health && <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>延迟 {v2Health.latency}ms</div>}
        </div>
        <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "20px" }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>成功率</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0fc6c2" }}>
            {stats?.successRate ?? 0}%
          </div>
        </div>
        <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "20px" }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>接口调用</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {stats?.totalCalls ?? 0}
            <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-tertiary)", marginLeft: 4 }}>次</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
            成功 {stats?.successCalls ?? 0} | 失败 {stats?.failedCalls ?? 0}
          </div>
        </div>
        <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "20px" }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>最近同步</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {stats?.lastSyncTime ? formatDateTime(stats.lastSyncTime) : "暂无"}
          </div>
        </div>
      </div>

      {/* V2 API 地址 */}
      <div style={{ padding: "12px 16px", background: "#f7f8fa", borderRadius: 8, marginBottom: 24, fontSize: 13 }}>
        <strong>V2 接口地址：</strong>
        <code style={{ background: "#e5e6eb", padding: "2px 6px", borderRadius: 4 }}>{v2ApiUrl}</code>
      </div>

      {/* 最近调用日志 */}
      <div className="card-enhanced" style={{ background: "white", borderRadius: 12, padding: "24px" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>最近接口调用日志</h3>
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "white" }}>
                <th style={thStyle}>时间</th><th style={thStyle}>Request ID</th><th style={thStyle}>接口</th>
                <th style={thStyle}>状态码</th><th style={thStyle}>耗时</th><th style={thStyle}>结果</th>
              </tr>
            </thead>
            <tbody>
              {stats?.recentLogs.map((log) => (
                <tr key={log.id} className="table-row-hover" style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={tdStyle}>{formatDateTime(log.createdAt)}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{log.requestId.slice(0, 8)}...</td>
                  <td style={tdStyle}>{log.apiName}</td>
                  <td style={tdStyle}>{log.responseStatus || "-"}</td>
                  <td style={tdStyle}>{log.durationMs}ms</td>
                  <td style={tdStyle}>
                    <span style={{
                      color: log.success ? "#00a854" : "#cf1322",
                      fontWeight: 500, fontSize: 12,
                    }}>
                      {log.success ? "成功" : "失败"}
                    </span>
                  </td>
                </tr>
              ))}
              {(!stats?.recentLogs || stats.recentLogs.length === 0) && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "var(--text-tertiary)" }}>暂无日志</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 14px", fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "10px 14px", fontSize: 13 };
