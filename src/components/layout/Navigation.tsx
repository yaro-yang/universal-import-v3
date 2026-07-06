"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MOCK_USERS, CurrentUser } from "@/types";

const navItems = [
  { href: "/", label: "工作台", icon: "◉" },
  { href: "/scan", label: "扫描品控", icon: "◎" },
  { href: "/tickets", label: "工单管理", icon: "☰" },
  { href: "/approvals", label: "审批中心", icon: "✓" },
  { href: "/settings", label: "规则配置", icon: "⚙" },
  { href: "/monitor", label: "同步监控", icon: "↻" },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser>(MOCK_USERS[4]); // 默认管理员

  const isActive = useCallback((href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }, [pathname]);

  useEffect(() => {
    const saved = localStorage.getItem("v3_current_user");
    if (saved) {
      try { setCurrentUser(JSON.parse(saved)); } catch {}
    }
  }, []);

  const switchUser = (user: CurrentUser) => {
    setCurrentUser(user);
    localStorage.setItem("v3_current_user", JSON.stringify(user));
    window.dispatchEvent(new CustomEvent("v3_user_changed", { detail: user }));
  };

  function getRoleColor(role: string) {
    const m: Record<string, string> = {
      admin: "#0fc6c2", operator: "#1890ff", qc_supervisor: "#fa8c16",
      level1_approver: "#722ed1", level2_approver: "#eb2f96",
    };
    return m[role] || "#86909c";
  }

  return (
    <>
      {/* 顶部栏 */}
      <header
        className="top-header"
        style={{
          position: "fixed", top: 0, left: "var(--sidebar-width)", right: 0, height: "var(--header-height)",
          background: "white", borderBottom: "1px solid var(--border)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              display: "none", background: "none", border: "none", fontSize: 20, cursor: "pointer",
              color: "var(--text-secondary)",
            }}
            className="lg:hidden"
          >
            ☰
          </button>
          <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)" }}>
            运单全流程管理系统 V3
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>当前角色：</span>
          <select
            value={currentUser.id}
            onChange={(e) => {
              const user = MOCK_USERS.find((u) => u.id === e.target.value);
              if (user) switchUser(user);
            }}
            style={{
              padding: "4px 12px", border: "1px solid var(--border)", borderRadius: 6,
              fontSize: 13, background: "white", color: getRoleColor(currentUser.role), fontWeight: 500,
              cursor: "pointer", outline: "none",
            }}
          >
            {MOCK_USERS.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <span
            style={{
              display: "inline-block", padding: "2px 8px", borderRadius: 4,
              background: getRoleColor(currentUser.role) + "18", color: getRoleColor(currentUser.role),
              fontSize: 12, fontWeight: 500,
            }}
          >
            {currentUser.name.split("（")[1]?.replace("）", "") || currentUser.role}
          </span>
        </div>
      </header>

      {/* 遮罩 */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.3)" }}
        />
      )}

      {/* 侧边栏 */}
      <nav
        className={`sidebar-panel ${sidebarOpen ? "open" : ""}`}
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, width: 240,
          background: "var(--sidebar-bg)", zIndex: 110,
          display: "flex", flexDirection: "column", overflowY: "auto",
        }}
      >
        {/* Logo 区 */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0fc6c2", letterSpacing: 1 }}>
            ◈ 鲸天 V3
          </div>
          <div style={{ fontSize: 11, color: "var(--sidebar-text)", marginTop: 2 }}>
            运单全流程管理
          </div>
        </div>

        {/* 导航项 */}
        <div style={{ flex: 1, padding: "12px 0" }}>
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <button
                key={item.href}
                onClick={() => { router.push(item.href); setSidebarOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", padding: "10px 20px", border: "none",
                  background: active ? "var(--sidebar-active-bg)" : "transparent",
                  color: active ? "var(--sidebar-active-text)" : "var(--sidebar-text)",
                  fontSize: 14, cursor: "pointer", textAlign: "left",
                  transition: "all 0.2s",
                  borderLeft: active ? "3px solid var(--primary)" : "3px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--sidebar-hover-bg)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* 底部信息 */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 11, color: "var(--sidebar-text)" }}>
            V3 独立部署系统
          </div>
        </div>
      </nav>
    </>
  );
}
