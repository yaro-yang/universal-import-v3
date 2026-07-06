// 通用工具函数

/** 生成工单号 YYYYMMDD-XXX */
export function generateTicketNo(index?: number): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = index !== undefined ? String(index + 1).padStart(3, "0") : String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  return `TK-${dateStr}-${seq}`;
}

/** 格式化时间 */
export function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 计算距今时长描述 */
export function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

/** 计算是否即将超时（剩余 < 2h） */
export function isApproachingTimeout(timeoutAt?: string): boolean {
  if (!timeoutAt) return false;
  const remaining = new Date(timeoutAt).getTime() - Date.now();
  return remaining > 0 && remaining < 2 * 60 * 60 * 1000;
}

/** 获取状态对应的颜色类 */
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: "#faad14", level1_review: "#1890ff", level2_review: "#722ed1",
    executing: "#fa8c16", completed: "#00a854", rejected_final: "#cf1322",
    pass: "#00a854", fail: "#cf1322",
  };
  return map[status] || "#86909c";
}

/** 获取状态对应的背景色类 */
export function getStatusBgColor(status: string): string {
  const map: Record<string, string> = {
    pending: "#fffbe6", level1_review: "#e6f7ff", level2_review: "#f9f0ff",
    executing: "#fff7e6", completed: "#f6ffed", rejected_final: "#fff1f0",
    pass: "#f6ffed", fail: "#fff1f0",
  };
  return map[status] || "#f7f8fa";
}

/** 截断文本 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}
