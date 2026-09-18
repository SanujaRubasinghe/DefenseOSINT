import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Right-hand inspection drawer. Radix handles focus trapping, escape and
 * scroll locking — worth the dependency for something analysts will open and
 * dismiss constantly with the keyboard.
 */
export default function SideDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-void/70 backdrop-blur-[2px] data-[state=open]:animate-fade-up" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-line bg-panel shadow-2xl focus:outline-none data-[state=open]:animate-fade-up"
          aria-describedby={undefined}
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate font-mono text-sm tracking-wide text-ink">
                {title}
              </Dialog.Title>
              {subtitle && <div className="mt-0.5 metadata">{subtitle}</div>}
            </div>
            <Dialog.Close
              className="rounded-sm p-1 text-dim transition-colors hover:bg-raised hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Label/value row used throughout drawers and metadata blocks. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="metadata uppercase tracking-[0.12em]">{label}</div>
      <div className="mt-0.5 break-words font-mono text-xs text-ink">{value ?? "—"}</div>
    </div>
  );
}
