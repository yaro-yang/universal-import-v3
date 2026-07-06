export default function Spinner({ size = 24, color = "#0fc6c2" }: { size?: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div
        style={{
          width: size, height: size, border: `3px solid ${color}20`,
          borderTopColor: color, borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
        }}
      />
    </div>
  );
}
