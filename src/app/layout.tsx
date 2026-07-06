import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import Navigation from "@/components/layout/Navigation";

export const metadata: Metadata = {
  title: "运单全流程管理系统 V3",
  description: "录单 → 扫描品控 → 异常上报 → 分级审批 → 执行联动 —— 运单全生命周期管理",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Navigation />
        <div className="main-content" style={{ marginLeft: "var(--sidebar-width)", marginTop: "var(--header-height)", minHeight: "calc(100vh - var(--header-height))" }}>
          {children}
        </div>
        <Toaster position="top-right" toastOptions={{ style: { fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif", fontSize: "14px" }, success: { style: { border: "1px solid #b7eb8f" } }, error: { style: { border: "1px solid #ffccc7" } } }} />
      </body>
    </html>
  );
}
