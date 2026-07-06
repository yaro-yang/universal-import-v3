export default function EmptyState({
  icon = "📋", title = "暂无数据", description = "",
}: {
  icon?: string; title?: string; description?: string;
}) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.6 }}>{icon}</div>
      <div style={{ fontSize: 16, color: "var(--text-secondary)", marginBottom: 8 }}>{title}</div>
      {description && <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{description}</div>}
    </div>
  );
}
