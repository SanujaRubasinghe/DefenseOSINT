import { useEffect, useState } from "react";

const LINES = [
  "INITIALIZING SECURE SESSION",
  "ESTABLISHING UPLINK TO GATEWAY",
  "VERIFYING AGENT MESH",
  "READY",
];

// Gates the dashboard behind a short boot readout. Tied to real state (the
// `done` prop, set once the gateway health check resolves) rather than a
// fixed timer, but held open for a minimum stretch so it doesn't just flash
// past on a fast connection.
export default function BootSequence({ done }: { done: boolean }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (lineIndex >= LINES.length - 1) return;
    const id = setTimeout(() => setLineIndex((i) => i + 1), 420);
    return () => clearTimeout(id);
  }, [lineIndex]);

  useEffect(() => {
    const id = setTimeout(() => setMinTimeElapsed(true), 1400);
    return () => clearTimeout(id);
  }, []);

  const ready = done && minTimeElapsed;

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setHidden(true), 350);
    return () => clearTimeout(id);
  }, [ready]);

  if (hidden) return null;

  return (
    <div className={`boot-overlay ${ready ? "boot-overlay-exit" : ""}`} aria-hidden={ready}>
      <div className="boot-panel">
        <div className="boot-scanbar" />
        <div className="boot-lines">
          {LINES.slice(0, lineIndex + 1).map((line, i) => (
            <div key={line} className="boot-line">
              <span className="boot-caret">{i === lineIndex && !ready ? ">" : "✓"}</span> {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
