import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TraceEvent } from "../api/types";
import { edgeForEvent, packetKindForEvent, type PacketKind } from "../agents/topology";

// The mock backend finishes an investigation in a few seconds — most A2A hops
// return in 10-50ms — so replaying the trace at wall-clock speed would be a
// single unreadable flash. Instead we step through the recorded events at a
// human pace. The events, their order, and their timestamps are all real; only
// the spacing between them is presentational.

const STEP_MS = 620;
const PACKET_MS = 900;
/** Return leg starts once the outbound packet is most of the way there. */
const RETURN_OFFSET = -0.6;

export interface Packet {
  id: number;
  edgeId: string;
  kind: PacketKind;
  /** Progress along the edge. Values below 0 are a not-yet-visible delay. */
  t: number;
  dir: 1 | -1;
}

/**
 * Events the planner dispatched concurrently (asyncio.gather over the pending
 * collect tasks) share an agent, an action and a timestamp to the second, so
 * grouping them lets the graph show genuine parallelism rather than faking a
 * strict sequence.
 */
function groupSteps(trace: TraceEvent[]): TraceEvent[][] {
  const steps: TraceEvent[][] = [];
  for (const event of trace) {
    const current = steps[steps.length - 1];
    const head = current?.[0];
    if (head && head.agent === event.agent && head.action === event.action) {
      current.push(event);
    } else {
      steps.push([event]);
    }
  }
  return steps;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export interface NetworkPlayback {
  playedEvents: TraceEvent[];
  packets: Packet[];
  activeAgents: Set<string>;
  activeEdges: Set<string>;
  /** Steps played vs. steps known — drives the "catching up" indicator. */
  progress: { played: number; total: number };
  isReplaying: boolean;
  replay: () => void;
}

export function useNetworkPlayback(trace: TraceEvent[], runId?: string | null): NetworkPlayback {
  const steps = useMemo(() => groupSteps(trace), [trace]);
  const [cursor, setCursor] = useState(0);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [settled, setSettled] = useState(false);
  const nextId = useRef(0);
  const reduced = useRef(prefersReducedMotion());

  // Playback lives above the router so navigating between pages does not
  // restart it — but switching to a different run must start from zero.
  const lastRun = useRef(runId);
  useEffect(() => {
    if (lastRun.current === runId) return;
    lastRun.current = runId;
    setPackets([]);
    setSettled(false);
    setCursor(0);
  }, [runId]);

  // Advance one step at a time while there is unplayed trace.
  useEffect(() => {
    if (cursor >= steps.length) return;
    const id = setTimeout(() => setCursor((c) => c + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [cursor, steps.length]);

  // The final step has no successor to advance to, so give it one beat on
  // screen and then let its agent settle from ACTIVE into its resting state.
  useEffect(() => {
    if (cursor === 0 || cursor < steps.length) {
      setSettled(false);
      return;
    }
    const id = setTimeout(() => setSettled(true), STEP_MS);
    return () => clearTimeout(id);
  }, [cursor, steps.length]);

  // Launch packets for the step that just became current.
  useEffect(() => {
    if (cursor === 0 || reduced.current) return;
    const step = steps[cursor - 1];
    if (!step) return;

    const spawned: Packet[] = [];
    for (const event of step) {
      const edgeId = edgeForEvent(event);
      if (!edgeId) continue;
      const kind = packetKindForEvent(event);
      spawned.push({ id: nextId.current++, edgeId, kind, t: 0, dir: 1 });
      // A dispatch is a round trip: the result comes back to the planner.
      if (edgeId.startsWith("planner>") && event.ok) {
        spawned.push({ id: nextId.current++, edgeId, kind, t: RETURN_OFFSET, dir: -1 });
      }
    }
    if (spawned.length > 0) setPackets((prev) => [...prev, ...spawned]);
  }, [cursor, steps]);

  // Drive packet motion only while something is in flight.
  const inFlight = packets.length > 0;
  useEffect(() => {
    if (!inFlight) return;
    let raf = 0;
    let last: number | null = null;
    let cancelled = false;

    const tick = (ts: number) => {
      if (cancelled) return;
      const dt = last == null ? 16 : ts - last;
      last = ts;
      setPackets((prev) =>
        prev.map((p) => ({ ...p, t: p.t + dt / PACKET_MS })).filter((p) => p.t < 1)
      );
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [inFlight]);

  const replay = useCallback(() => {
    setPackets([]);
    setSettled(false);
    setCursor(0);
  }, []);

  const playedEvents = useMemo(() => steps.slice(0, cursor).flat(), [steps, cursor]);

  const activeEdges = useMemo(() => {
    const set = new Set<string>();
    for (const p of packets) if (p.t >= 0) set.add(p.edgeId);
    return set;
  }, [packets]);

  // A node counts as active while its current step is playing or its packets
  // are still moving, so parallel dispatches light up several nodes at once.
  const activeAgents = useMemo(() => {
    const set = new Set<string>();
    const step = steps[cursor - 1];
    if (step && !settled) {
      for (const e of step) set.add(e.agent);
    }
    for (const p of packets) {
      if (p.t < 0) continue;
      const [from, to] = p.edgeId.split(">");
      set.add(`${p.dir === 1 ? to : from}-agent`);
    }
    return set;
  }, [steps, cursor, packets, settled]);

  return {
    playedEvents,
    packets,
    activeAgents,
    activeEdges,
    progress: { played: cursor, total: steps.length },
    isReplaying: cursor < steps.length,
    replay,
  };
}
