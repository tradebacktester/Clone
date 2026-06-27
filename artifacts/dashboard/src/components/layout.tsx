import { ReactNode, useState } from "react";
import { NavSidebar } from "./nav-sidebar";
import { Menu } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="dark h-screen w-full flex overflow-hidden bg-background text-foreground font-sans" style={{ position: "relative" }}>
      {/* Ambient background orbs */}
      <div className="ai-orb-1" />
      <div className="ai-orb-2" />

      {/* AI grid overlay */}
      <div className="ai-grid-bg" style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.6,
      }} />

      {/* Mobile top bar */}
      <div className="md:hidden" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 40,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        background: "hsl(245 20% 4%)",
        borderBottom: "1px solid rgba(139,92,246,0.18)",
        flexShrink: 0,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            overflow: "hidden",
            border: "1px solid rgba(139,92,246,0.4)",
            boxShadow: "0 0 8px rgba(139,92,246,0.3)",
          }}>
            <img src="/krytos-logo.png" alt="Krytos" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{
            fontWeight: 800, fontSize: 14, letterSpacing: "0.3em",
            textTransform: "uppercase", color: "#fff",
          }}>
            KRY<span style={{ color: "hsl(262 80% 65%)" }}>T</span>OS
          </span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          style={{
            padding: 8, borderRadius: 8, border: "1px solid rgba(139,92,246,0.2)",
            background: "rgba(139,92,246,0.08)", color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
          }}
        >
          <Menu style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block" style={{ flexShrink: 0, position: "relative", zIndex: 10 }}>
        <NavSidebar />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            }}
            className="md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="md:hidden"
            style={{
              position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 50,
              width: 272, display: "flex", flexDirection: "column",
              boxShadow: "4px 0 40px rgba(0,0,0,0.6), 4px 0 20px rgba(139,92,246,0.1)",
              animation: "slideInFromLeft 0.2s ease-out",
            }}
          >
            <NavSidebar onClose={() => setMobileOpen(false)} />
          </div>
          <style>{`@keyframes slideInFromLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }`}</style>
        </>
      )}

      {/* Main content */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        overflow: "hidden",
        paddingTop: "var(--mobile-header, 0px)",
        position: "relative", zIndex: 1,
      }}
        className="pt-[53px] md:pt-0"
      >
        {children}
      </main>
    </div>
  );
}
