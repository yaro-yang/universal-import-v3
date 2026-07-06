"use client";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  style?: React.CSSProperties;
}

export default function Button({
  children, onClick, variant = "primary", size = "md", loading, disabled, type = "button", className, style,
}: ButtonProps) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    border: "none", borderRadius: 8, cursor: disabled || loading ? "not-allowed" : "pointer",
    fontWeight: 500, transition: "all 0.2s", opacity: disabled || loading ? 0.6 : 1,
    whiteSpace: "nowrap",
  };

  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: "4px 12px", fontSize: 12, height: 30 },
    md: { padding: "8px 20px", fontSize: 14, height: 38 },
    lg: { padding: "10px 28px", fontSize: 15, height: 44 },
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: { background: "#0fc6c2", color: "white" },
    outline: { background: "white", color: "#0fc6c2", border: "1px solid #0fc6c2" },
    secondary: { background: "#f0f0f0", color: "#1d2129" },
    danger: { background: "#cf1322", color: "white" },
    ghost: { background: "transparent", color: "#4e5969" },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
    >
      {loading && <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />}
      {children}
    </button>
  );
}
