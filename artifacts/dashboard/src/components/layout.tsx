import { ReactNode } from "react";
import { NavSidebar } from "./nav-sidebar";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="dark h-screen w-full flex overflow-hidden bg-background text-foreground font-sans">
      <NavSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
