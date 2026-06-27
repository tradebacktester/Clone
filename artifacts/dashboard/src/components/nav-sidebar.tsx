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
  HelpCircle,
  X,
} from "lucide-react";
import { GuideModal } from "./guide-modal";

interface NavSidebarProps {
  onClose?: () => void;
}

export function NavSidebar({ onClose }: NavSidebarProps = {}) {
  const [location] = useLocation();
  const [guideOpen, setGuideOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/trades", label: "Journal", icon: ListOrdered },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/market", label: "Market", icon: Globe2 },
    { href: "/regime", label: "Regimes", icon: TrendingUp },
    { href: "/monte-carlo", label: "Monte Carlo", icon: Dices },
    { href: "/insights", label: "V2 Insights", icon: Layers },
    { href: "/reports", label: "Reports", icon: FileText },
    { href: "/time-performance", label: "Time Perf.", icon: Clock },
    { href: "/supervisor", label: "Supervisor", icon: Radar },
    { href: "/quality", label: "Quality", icon: ShieldCheck },
    { href: "/memory", label: "Memory", icon: Brain },
    { href: "/learning", label: "Learning", icon: BrainCircuit },
    { href: "/replay", label: "Replay", icon: Rewind },
    { href: "/historical", label: "Historical", icon: Database },
    { href: "/robustness", label: "Robustness", icon: FlaskConical },
    { href: "/trader-intelligence", label: "Trader Intel.", icon: Lightbulb },
    { href: "/production-readiness", label: "Prod. Readiness", icon: ShieldAlert },
    { href: "/deployment", label: "Deployment", icon: Server },
    { href: "/readiness-checklist", label: "Live Readiness", icon: ClipboardCheck },
    { href: "/live-journal", label: "Live Journal", icon: BookOpen },
    { href: "/backtest", label: "Backtest", icon: History },
    { label: "─ Go-Live Pipeline ─", href: "#", icon: Activity, divider: true },
    { href: "/paper-trading", label: "Paper Trading", icon: Activity },
    { href: "/comparison", label: "Bot vs Manual", icon: Scale },
    { href: "/threshold", label: "Thresholds", icon: Zap },
    { href: "/pilot", label: "Pilot Mode", icon: Shield },
    { href: "/improvement", label: "Improvement", icon: TrendingUp },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <>
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col h-full">
        {/* Logo row — with close button when used as mobile drawer */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
          <img
            src="/krytos-logo.png"
            alt="Krytos"
            className="w-8 h-8 rounded object-cover flex-shrink-0"
          />
          <span className="font-bold text-lg tracking-widest uppercase flex-1">
            KRY<span className="text-red-500">T</span>OS
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-sidebar-accent transition-colors flex-shrink-0"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item, idx) => {
            if ((item as Record<string, unknown>).divider) {
              return (
                <div key={idx} className="pt-3 pb-1 px-3">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">{item.label}</span>
                </div>
              );
            }
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && item.href !== "#" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Help button */}
        <div className="p-4 border-t border-border flex-shrink-0">
          <button
            onClick={() => setGuideOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
          >
            <HelpCircle className="w-4 h-4 flex-shrink-0" />
            How to Use Krytos
          </button>
        </div>
      </aside>

      <GuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
