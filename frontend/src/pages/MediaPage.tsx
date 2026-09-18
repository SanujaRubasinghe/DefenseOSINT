import { ExternalLink, Images } from "lucide-react";
import { useMemo, useState } from "react";
import type { ImageAsset } from "../intel/parse";
import { extractImages } from "../intel/parse";
import SideDrawer, { Field } from "../components/common/SideDrawer";
import { EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { useInvestigation } from "../state/InvestigationContext";

function Thumb({ asset, onOpen }: { asset: ImageAsset; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="group overflow-hidden rounded-sm border border-line bg-panel transition-colors hover:border-line-bright">
      <button onClick={onOpen} className="block w-full text-left">
        {failed ? (
          <div className="grid h-36 place-items-center font-mono text-2xs text-dim">
            IMAGE UNAVAILABLE
          </div>
        ) : (
          <img
            src={asset.imageUrl}
            alt={asset.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-36 w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        )}
        <figcaption className="space-y-0.5 p-2">
          <p className="truncate text-xs text-ink">{asset.title}</p>
          <p className="metadata truncate">{asset.sourceName}</p>
          <p className="metadata truncate">{asset.evidenceId}</p>
        </figcaption>
      </button>
    </figure>
  );
}

export default function MediaPage() {
  const { investigation } = useInvestigation();
  const assets = useMemo(
    () => extractImages(investigation?.evidence ?? []),
    [investigation?.evidence]
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const active = assets.find((a) => a.evidenceId === openId) ?? null;

  return (
    <>
      <Panel>
        <PanelHeader
          title="Media Analysis"
          icon={<Images className="h-3.5 w-3.5" />}
          meta={`${assets.length} asset${assets.length === 1 ? "" : "s"}`}
        />
        {assets.length === 0 ? (
          <EmptyState
            icon={<Images className="h-6 w-6" />}
            title="No imagery collected"
            hint="Imagery is retrieved when the objective names a recognisable person, organisation or place — the collector looks it up and attaches the thumbnail."
          />
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
            {assets.map((a) => (
              <Thumb key={a.evidenceId} asset={a} onOpen={() => setOpenId(a.evidenceId)} />
            ))}
          </div>
        )}
      </Panel>

      <SideDrawer
        open={!!active}
        onOpenChange={(v) => !v && setOpenId(null)}
        title={active?.title ?? ""}
        subtitle={active?.evidenceId}
      >
        {active && (
          <div className="space-y-4">
            <img
              src={active.imageUrl}
              alt={active.title}
              referrerPolicy="no-referrer"
              className="w-full rounded-sm border border-line"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source" value={active.sourceName} />
              <Field label="Evidence ID" value={active.evidenceId} />
            </div>
            {active.caption && (
              <section>
                <p className="panel-title mb-2">Caption</p>
                <p className="text-xs leading-relaxed text-muted">{active.caption}</p>
              </section>
            )}
            {active.sourceUrl && (
              <a
                href={active.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 break-all font-mono text-2xs text-accent hover:underline"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                {active.sourceUrl}
              </a>
            )}
          </div>
        )}
      </SideDrawer>
    </>
  );
}
