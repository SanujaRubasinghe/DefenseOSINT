import type { ReactNode } from "react";

interface PanelProps {
  index: string; // "00".."07" — mirrors real pipeline order, not decoration
  title: string;
  meta?: ReactNode;
  variant?: "default" | "error";
  scanning?: boolean; // sweep animation for panels reflecting live/in-progress state
  children: ReactNode;
}

export default function Panel({ index, title, meta, variant = "default", scanning, children }: PanelProps) {
  const classes = ["panel"];
  if (variant === "error") classes.push("panel-error");
  if (scanning) classes.push("panel-scanning");

  return (
    <section className={classes.join(" ")}>
      <header className="panel-head">
        <h2 className="panel-title">
          <span className="panel-index">PANEL {index}</span>
          <span className="panel-sep">//</span>
          <span>{title}</span>
        </h2>
        {meta && <div className="panel-meta">{meta}</div>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
