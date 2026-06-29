import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ListOrdered,
  BarChart3,
  Globe2,
  BrainCircuit,
  History,
  Settings,
  Activity,
  TrendingUp,
  Dices,
  ShieldCheck,
  Brain,
  Radar,
  Layers,
  FileText,
  Clock,
  Rewind,
  Database,
  ShieldAlert,
  Server,
  BookOpen,
  ClipboardCheck,
  FlaskConical,
  Lightbulb,
  Scale,
  Shield,
  Zap,
  Camera,
  HeartPulse,
  HelpCircle,
  X,
  Cpu,
  Sparkles,
} from "lucide-react";
import { GuideModal } from "./guide-modal";

interface NavSidebarProps {
  onClose?: () => void;
}

const NAV_GROUPS = [
  {
    label: "Core",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/trades", label: "Journal", icon: ListOrdered },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Market Intelligence",
    items: [
      { href: "/market", label: "Market", icon: Globe2 },
      { href: "/regime", label: "Regimes", icon: TrendingUp },
      { href: "/monte-carlo", label: "Monte Carlo", icon: Dices },
      { href: "/insights", label: "V2 Insights", icon: Layers },
      { href: "/time-performance", label: "Time Perf.", icon: Clock },
      { href: "/market-intelligence", label: "Perception", icon: Radar },
      { href: "/market-context", label: "Mkt Context", icon: Brain },
      { href: "/market-world", label: "World Model", icon: Globe2 },
    ],
  },
  {
    label: "AI Engine",
    items: [
      { href: "/supervisor", label: "Supervisor", icon: Radar },
      { href: "/quality", label: "Quality", icon: ShieldCheck },
      { href: "/memory", label: "Memory", icon: Brain },
      { href: "/learning", label: "Learning", icon: BrainCircuit },
      { href: "/learning/patterns", label: "Pattern Perf.", icon: Sparkles },
      { href: "/feature-intelligence", label: "Feature Intel.", icon: BarChart3 },
      { href: "/decision-intelligence", label: "Decision Intel.", icon: Cpu },
      { href: "/trader-intelligence", label: "Trader Intel.", icon: Lightbulb },
      { href: "/context-memory", label: "Context Memory", icon: Camera },
      { href: "/memory-health", label: "Mem. Health", icon: HeartPulse },
      { href: "/learning-health", label: "Learning Health", icon: Shield },
      { href: "/learning-enhancement", label: "Learn. Enhance.", icon: Sparkles },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/reports", label: "Reports", icon: FileText },
      { href: "/replay", label: "Replay", icon: Rewind },
      { href: "/historical", label: "Historical", icon: Database },
      { href: "/robustness", label: "Robustness", icon: FlaskConical },
      { href: "/backtest", label: "Backtest", icon: History },
    ],
  },
  {
    label: "Go-Live Pipeline",
    items: [
      { href: "/paper-trading", label: "Paper Trading", icon: Activity },
      { href: "/comparison", label: "Bot vs Manual", icon: Scale },
      { href: "/threshold", label: "Thresholds", icon: Zap },
      { href: "/pilot", label: "Pilot Mode", icon: Shield },
      { href: "/improvement", label: "Improvement", icon: TrendingUp },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/production-readiness", label: "Prod. Readiness", icon: ShieldAlert },
      { href: "/deployment", label: "Deployment", icon: Server },
      { href: "/readiness-checklist", label: "Live Readiness", icon: ClipboardCheck },
      { href: "/live-journal", label: "Live Journal", icon: BookOpen },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function NavSidebar({ onClose }: NavSidebarProps = {}) {
  const [location] = useLocation();
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <aside className="w-64 flex flex-col h-full ai-sidebar-gradient" style={{
        borderRight: "1px solid rgba(139,92,246,0.15)",
      }}>
        {/* Logo */}
        <div style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(139,92,246,0.15)",
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          background: "linear-gradient(180deg, rgba(139,92,246,0.08) 0%, transparent 100%)",
        }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              overflow: "hidden",
              border: "1px solid rgba(139,92,246,0.4)",
              boxShadow: "0 0 12px rgba(139,92,246,0.35)",
            }}>
              <img src="/krytos-logo.png" alt="Krytos" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{
              position: "absolute", bottom: -2, right: -2,
              width: 8, height: 8, borderRadius: "50%",
              background: "hsl(142 68% 48%)",
              border: "1.5px solid hsl(245 20% 4%)",
              boxShadow: "0 0 6px rgba(34,197,94,0.6)",
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 800, fontSize: 15, letterSpacing: "0.3em",
              textTransform: "uppercase", color: "#fff",
              fontFamily: "'Inter', sans-serif",
            }}>
              KRY<span style={{ color: "hsl(262 80% 65%)" }}>T</span>OS
            </div>
            <div style={{
              fontSize: 9, color: "rgba(139,92,246,0.7)",
              letterSpacing: "0.18em", textTransform: "uppercase",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 1,
            }}>
              AI Trading Engine
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                padding: 6, borderRadius: 6, border: "none",
                background: "transparent", cursor: "pointer", color: "rgba(255,255,255,0.5)",
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        {/* Status bar */}
        <div style={{
          padding: "6px 16px",
          borderBottom: "1px solid rgba(139,92,246,0.08)",
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(139,92,246,0.03)",
        }}>
          <Cpu style={{ width: 10, height: 10, color: "hsl(262 80% 65%)" }} />
          <span style={{
            fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
            color: "rgba(139,92,246,0.6)", letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            Neural Core Active
          </span>
          <div style={{
            marginLeft: "auto", width: 6, height: 6, borderRadius: "50%",
            background: "hsl(262 80% 65%)",
            boxShadow: "0 0 6px rgba(139,92,246,0.8)",
            animation: "ai-pulse-glow 2s ease-in-out infinite",
          }} />
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: "10px 10px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div style={{
                padding: "8px 10px 4px",
                fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                color: "rgba(139,92,246,0.45)", letterSpacing: "0.18em",
                textTransform: "uppercase", userSelect: "none",
              }}>
                {group.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href ||
                    (item.href !== "/" && item.href !== "#" && location.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      style={{
                        display: "flex", alignItems: "center", gap: 9,
                        padding: "7px 10px", borderRadius: 7,
                        fontSize: 12.5, fontWeight: isActive ? 600 : 400,
                        fontFamily: "'Inter', sans-serif",
                        textDecoration: "none", cursor: "pointer",
                        transition: "all 0.15s ease",
                        ...(isActive ? {
                          background: "linear-gradient(90deg, rgba(139,92,246,0.18) 0%, rgba(139,92,246,0.06) 100%)",
                          borderLeft: "2px solid hsl(262 80% 65%)",
                          color: "#fff",
                          paddingLeft: 8,
                          boxShadow: "inset 4px 0 12px rgba(139,92,246,0.06)",
                        } : {
                          color: "rgba(255,255,255,0.55)",
                          borderLeft: "2px solid transparent",
                        }),
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)";
                          (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.07)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }
                      }}
                    >
                      <Icon style={{
                        width: 14, height: 14, flexShrink: 0,
                        color: isActive ? "hsl(262 80% 65%)" : "rgba(255,255,255,0.35)",
                      }} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Help button */}
        <div style={{
          padding: "10px 12px",
          borderTop: "1px solid rgba(139,92,246,0.12)",
          flexShrink: 0,
        }}>
          <button
            onClick={() => setGuideOpen(true)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "9px 12px", borderRadius: 8, cursor: "pointer",
              background: "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(99,102,241,0.08) 100%)",
              border: "1px solid rgba(139,92,246,0.25)",
              color: "hsl(262 80% 72%)",
              fontSize: 12.5, fontWeight: 500, fontFamily: "'Inter', sans-serif",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(99,102,241,0.14) 100%)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 16px rgba(139,92,246,0.2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(99,102,241,0.08) 100%)";
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            <Sparkles style={{ width: 14, height: 14, flexShrink: 0 }} />
            How to Use Krytos AI
          </button>
        </div>
      </aside>

      <GuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
