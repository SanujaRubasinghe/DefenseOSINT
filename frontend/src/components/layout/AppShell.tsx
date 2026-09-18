import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useInvestigation } from "../../state/InvestigationContext";
import CommandPalette from "../navigation/CommandPalette";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { investigation } = useInvestigation();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Counts come straight off the live investigation; sections with nothing
  // behind them simply show no badge.
  const counts: Record<string, number | null> = {
    "/feed": investigation?.evidence.length ?? null,
    "/evidence": investigation?.evidence.length ?? null,
    "/entities": investigation?.entities?.entities.length ?? null,
    "/agents": investigation?.trace.length ?? null,
    "/media": null,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenSearch={() => setPaletteOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
