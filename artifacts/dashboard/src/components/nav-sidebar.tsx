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
} from "lucide-react";

export function NavSidebar() {
  const [location] = useLocation();

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
    { href: "/production-readiness", label: "Prod. Readiness", icon: ShieldAlert },
    { href: "/deployment", label: "Deployment", icon: Server },
    { href: "/readiness-checklist", label: "Live Readiness", icon: ClipboardCheck },
    { href: "/live-journal", label: "Live Journal", icon: BookOpen },
    { href: "/backtest", label: "Backtest", icon: History },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-border bg-sidebar flex-shrink-0 flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Activity className="w-6 h-6 text-primary" />
        <span className="font-bold text-lg tracking-tight uppercase">TradeClone AI</span>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
