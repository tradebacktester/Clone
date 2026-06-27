import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: number;
  trendLabel?: string;
  className?: string;
  valueClassName?: string;
}

export function MetricCard({
  title,
  value,
  description,
  icon,
  trend,
  trendLabel,
  className,
  valueClassName,
}: MetricCardProps) {
  return (
    <div
      className={cn("ai-card", className)}
      style={{
        background: "linear-gradient(135deg, hsl(245 18% 6%) 0%, hsl(250 20% 5%) 100%)",
        border: "1px solid rgba(139,92,246,0.14)",
        borderRadius: 10,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top accent bar */}
      <div style={{
        height: 2,
        background: "linear-gradient(90deg, hsl(262 80% 55%), hsl(220 80% 65%), transparent)",
        opacity: 0.7,
      }} />

      {/* Subtle corner glow */}
      <div style={{
        position: "absolute", top: 0, right: 0,
        width: 60, height: 60,
        background: "radial-gradient(circle at top right, rgba(139,92,246,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 8px",
        borderBottom: "1px solid rgba(139,92,246,0.06)",
      }}>
        <span style={{
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500, letterSpacing: "0.15em",
          textTransform: "uppercase", color: "rgba(200,185,255,0.55)",
        }}>
          {title}
        </span>
        {icon && (
          <div style={{ color: "rgba(139,92,246,0.6)" }}>
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      <div style={{ padding: "10px 16px 14px" }}>
        <div className={cn("text-2xl font-bold font-mono tracking-tight", valueClassName)}
          style={{
            fontSize: 22, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {value}
        </div>

        {(description || trend !== undefined) && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            marginTop: 4,
          }}>
            {trend !== undefined && (
              <span style={{
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                color: trend > 0 ? "hsl(142 68% 48%)" : trend < 0 ? "hsl(0 75% 58%)" : "rgba(255,255,255,0.4)",
              }}>
                {trend > 0 ? "▲" : trend < 0 ? "▼" : "─"} {Math.abs(trend)}%
              </span>
            )}
            {description && (
              <span style={{
                fontSize: 11, color: "rgba(255,255,255,0.35)",
                fontFamily: "'Inter', sans-serif",
              }}>
                {description}
              </span>
            )}
            {trendLabel && (
              <span style={{
                fontSize: 11, color: "rgba(255,255,255,0.35)",
              }}>
                {trendLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
