export function StatusDot({ status, label }: { status: string; label?: string }) {
  const colors: Record<string, string> = {
    pending: "#faad14", level1_review: "#1890ff", level2_review: "#722ed1",
    executing: "#fa8c16", completed: "#00a854", rejected_final: "#cf1322",
    pass: "#00a854", fail: "#cf1322", pending_comp: "#faad14",
    manual: "#1890ff", scan_trigger: "#0fc6c2",
  };
  const bgColors: Record<string, string> = {
    pending: "#fffbe6", level1_review: "#e6f7ff", level2_review: "#f9f0ff",
    executing: "#fff7e6", completed: "#f6ffed", rejected_final: "#fff1f0",
    pass: "#f6ffed", fail: "#fff1f0", pending_comp: "#fffbe6",
    manual: "#e6f7ff", scan_trigger: "#e8fafa",
  };
  const color = colors[status] || "#86909c";
  const bg = bgColors[status] || "#f7f8fa";

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500,
      background: bg, color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label || status}
    </span>
  );
}

export function StatBlock({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "#0fc6c2" }}>
        {value}{unit && <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>{label}</div>
    </div>
  );
}
