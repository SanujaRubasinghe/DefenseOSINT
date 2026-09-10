import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, getHealth, getInvestigation, startInvestigation } from "../api/client";
import type { Investigation } from "../api/types";
import { useNetworkPlayback, type NetworkPlayback } from "../hooks/useNetworkPlayback";

const ACTIVE_STATUSES = new Set(["planning", "running"]);
const POLL_MS = 1500;

interface InvestigationState {
  investigation: Investigation | null;
  gatewayStatus: string;
  gatewayChecked: boolean;
  networkOnline: boolean;
  isLive: boolean;
  loadError: string | null;
  submitting: boolean;
  playback: NetworkPlayback;
  start: (objective: string) => Promise<string>;
  ensureLoaded: (id: string) => void;
}

const Ctx = createContext<InvestigationState | null>(null);

export function useInvestigation(): InvestigationState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInvestigation must be used inside InvestigationProvider");
  return ctx;
}

function message(err: unknown): string {
  return err instanceof ApiError ? err.message : String(err);
}

/**
 * Owns investigation state for the whole console. It sits above the router so
 * polling and graph playback keep running while the analyst moves between
 * pages, instead of restarting on every navigation.
 */
export function InvestigationProvider({ children }: { children: ReactNode }) {
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState("checking");
  const [gatewayChecked, setGatewayChecked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestedId, setRequestedId] = useState<string | null>(null);

  const isLive = investigation ? ACTIVE_STATUSES.has(investigation.status) : false;
  const playback = useNetworkPlayback(
    investigation?.trace ?? [],
    investigation?.investigation_id ?? null
  );

  useEffect(() => {
    getHealth()
      .then((d) => setGatewayStatus(d.status))
      .catch(() => setGatewayStatus("unreachable"))
      .finally(() => setGatewayChecked(true));
  }, []);

  // Deep links and page refreshes land on a run we have not fetched yet.
  useEffect(() => {
    if (!requestedId || investigation?.investigation_id === requestedId) return;
    let cancelled = false;
    getInvestigation(requestedId)
      .then((inv) => {
        if (!cancelled) {
          setInvestigation(inv);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(message(err));
      });
    return () => {
      cancelled = true;
    };
  }, [requestedId, investigation?.investigation_id]);

  // Poll only while the run is still moving. Deps are the id and the live
  // flag, both stable across polls, so the interval is not torn down on
  // every tick.
  useEffect(() => {
    const id = investigation?.investigation_id;
    if (!id || !isLive) return;
    let cancelled = false;

    const handle = setInterval(async () => {
      try {
        const inv = await getInvestigation(id);
        if (cancelled) return;
        setInvestigation(inv);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(message(err));
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [investigation?.investigation_id, isLive]);

  const start = useCallback(async (objective: string) => {
    setSubmitting(true);
    try {
      const { investigation_id } = await startInvestigation(objective);
      const inv = await getInvestigation(investigation_id);
      setInvestigation(inv);
      setRequestedId(investigation_id);
      setLoadError(null);
      return investigation_id;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const ensureLoaded = useCallback((id: string) => setRequestedId(id), []);

  const value = useMemo<InvestigationState>(
    () => ({
      investigation,
      gatewayStatus,
      gatewayChecked,
      networkOnline: gatewayStatus === "ok",
      isLive,
      loadError,
      submitting,
      playback,
      start,
      ensureLoaded,
    }),
    [
      investigation,
      gatewayStatus,
      gatewayChecked,
      isLive,
      loadError,
      submitting,
      playback,
      start,
      ensureLoaded,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
