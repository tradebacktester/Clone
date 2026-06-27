import { ReactNode, useState } from "react";
import { NavSidebar } from "./nav-sidebar";
import { Menu } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="dark h-screen w-full flex overflow-hidden bg-background text-foreground font-sans">
      {/* ── Mobile top bar (hidden on md+) ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src="/krytos-logo.png" alt="Krytos" className="w-7 h-7 rounded object-cover flex-shrink-0" />
          <span className="font-bold text-base tracking-widest uppercase">
            KRY<span className="text-red-500">T</span>OS
          </span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-md hover:bg-sidebar-accent transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* ── Desktop sidebar (always visible on md+) ── */}
      <div className="hidden md:block flex-shrink-0">
        <NavSidebar />
      </div>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/70 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed left-0 top-0 bottom-0 z-50 w-72 md:hidden flex flex-col bg-sidebar border-r border-border shadow-2xl animate-in slide-in-from-left duration-200">
            <NavSidebar onClose={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden pt-[53px] md:pt-0">
        {children}
      </main>
    </div>
  );
}
