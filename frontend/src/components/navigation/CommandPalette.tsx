import * as Dialog from "@radix-ui/react-dialog";
import { Boxes, CornerDownLeft, Globe, Network, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useInvestigation } from "../../state/InvestigationContext";

type Category = "Entity" | "Evidence" | "Source" | "Page";

interface Result {
  id: string;
  category: Category;
  label: string;
  hint: string;
  to: string;
}

const PAGES: Result[] = [
  { id: "p-overview", category: "Page", label: "Overview", hint: "dashboard", to: "/" },
  { id: "p-feed", category: "Page", label: "Intelligence Feed", hint: "evidence stream", to: "/feed" },
  { id: "p-entities", category: "Page", label: "Entity Intelligence", hint: "graph", to: "/entities" },
  { id: "p-evidence", category: "Page", label: "Evidence Explorer", hint: "table", to: "/evidence" },
  { id: "p-agents", category: "Page", label: "Agent Activity", hint: "fabric", to: "/agents" },
];

const ICONS: Record<Category, typeof Search> = {
  Entity: Network,
  Evidence: Boxes,
  Source: Globe,
  Page: Search,
};

/**
 * Cmd/Ctrl+K palette over real investigation data — entities, evidence and
 * sources the agents actually produced, plus navigation.
 */
export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const { investigation } = useInvestigation();
  const listRef = useRef<HTMLDivElement>(null);

  const corpus = useMemo<Result[]>(() => {
    const out: Result[] = [...PAGES];
    for (const e of investigation?.entities?.entities ?? []) {
      out.push({
        id: `e-${e.canonical_id}`,
        category: "Entity",
        label: e.name,
        hint: `${e.type} · conf ${e.confidence.toFixed(2)} · ${e.evidence_ids.length} evidence`,
        to: `/entities?focus=${encodeURIComponent(e.canonical_id)}`,
      });
    }
    for (const r of investigation?.evidence ?? []) {
      out.push({
        id: `v-${r.evidence_id}`,
        category: "Evidence",
        label: r.title || r.provenance.source_name,
        hint: `${r.provenance.source_type} · ${r.evidence_id}`,
        to: `/evidence?focus=${encodeURIComponent(r.evidence_id)}`,
      });
    }
    const sources = new Map<string, number>();
    for (const r of investigation?.evidence ?? []) {
      sources.set(r.provenance.source_name, (sources.get(r.provenance.source_name) ?? 0) + 1);
    }
    for (const [name, count] of sources) {
      out.push({
        id: `s-${name}`,
        category: "Source",
        label: name,
        hint: `${count} record${count === 1 ? "" : "s"}`,
        to: `/feed?source=${encodeURIComponent(name)}`,
      });
    }
    return out;
  }, [investigation]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? corpus.filter((r) => r.label.toLowerCase().includes(q) || r.hint.toLowerCase().includes(q))
      : corpus.filter((r) => r.category === "Page");
    return pool.slice(0, 40);
  }, [corpus, query]);

  useEffect(() => setCursor(0), [query, open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function choose(result: Result | undefined) {
    if (!result) return;
    onOpenChange(false);
    setQuery("");
    navigate(result.to);
  }

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});
  let flatIndex = -1;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-void/70 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[18%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-sm border border-line-bright bg-panel shadow-2xl focus:outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>

          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="h-4 w-4 shrink-0 text-dim" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  choose(results[cursor]);
                }
              }}
              placeholder="Search entities, evidence, sources…"
              className="h-11 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none"
            />
            <kbd className="rounded-sm border border-line bg-raised px-1 font-mono text-2xs text-dim">
              ESC
            </kbd>
          </div>

          <div ref={listRef} className="max-h-80 overflow-y-auto py-1.5">
            {results.length === 0 ? (
              <p className="px-4 py-8 text-center font-mono text-xs text-dim">
                NO MATCHES {investigation ? "" : "— run a collection first"}
              </p>
            ) : (
              Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="mb-1">
                  <p className="px-3 py-1 font-mono text-2xs uppercase tracking-[0.16em] text-dim">
                    {category}
                  </p>
                  {items.map((r) => {
                    flatIndex += 1;
                    const index = flatIndex;
                    const Icon = ICONS[r.category];
                    const active = index === cursor;
                    return (
                      <button
                        key={r.id}
                        data-active={active}
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => choose(r)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
                          active ? "bg-accent/10" : "hover:bg-raised"
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-accent" : "text-dim")} />
                        <span className="flex-1 truncate text-sm text-ink">{r.label}</span>
                        <span className="metadata truncate">{r.hint}</span>
                        {active && <CornerDownLeft className="h-3 w-3 shrink-0 text-accent" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
