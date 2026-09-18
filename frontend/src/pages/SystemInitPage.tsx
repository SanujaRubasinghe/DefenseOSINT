import { CheckCircle2, Loader2, Radar, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { NODES, type AgentId } from "../agents/topology";
import { ApiError, getHealth, getMe, getSystemStatus, type SystemStatus } from "../api/client";
import { Button } from "../components/ui/primitives";
import { cn } from "../lib/utils";
import { useAuth } from "../state/AuthContext";

type CheckState = "pending" | "ok" | "fail";

const AGENT_LABEL = new Map(NODES.map((n) => [n.id, `${n.code} ${n.label}`]));

function CheckRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: CheckState;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        {state === "pending" && <Loader2 className="h-3.5 w-3.5 animate-spin text-dim" />}
        {state === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-verified" />}
        {state === "fail" && <XCircle className="h-3.5 w-3.5 text-critical" />}
        <span className="font-mono text-xs uppercase tracking-[0.1em] text-ink">{label}</span>
      </div>
      {detail && (
        <span className={cn("metadata", state === "fail" && "text-critical")}>{detail}</span>
      )}
    </div>
  );
}

/**
 * Runs after every fresh login, before the console is reachable. Every line
 * here is a real round trip through the gateway — session verification,
 * gateway reachability, and a genuine health ping to all five agents — not a
 * scripted delay. A failed session check means the token is bad, so it drops
 * straight back to login; an offline agent is shown but does not block entry,
 * since the console is still usable in a degraded state.
 */
export default function SystemInitPage() {
  const { username, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [session, setSession] = useState<CheckState>("pending");
  const [gateway, setGateway] = useState<CheckState>("pending");
  const [mesh, setMesh] = useState<CheckState>("pending");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [meshError, setMeshError] = useState<string | null>(null);
  const [proceed, setProceed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    getMe()
      .then(() => !cancelled && setSession("ok"))
      .catch(() => !cancelled && setSession("fail"));

    getHealth()
      .then((d) => !cancelled && setGateway(d.status === "ok" ? "ok" : "fail"))
      .catch(() => !cancelled && setGateway("fail"));

    getSystemStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setMesh(s.all_online ? "ok" : "fail");
      })
      .catch((err) => {
        if (cancelled) return;
        setMesh("fail");
        setMeshError(err instanceof ApiError ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const allSettled = session !== "pending" && gateway !== "pending" && mesh !== "pending";

  useEffect(() => {
    if (!allSettled || proceed) return;
    // The checks above are real network calls; this is purely a beat so the
    // checklist is readable instead of flashing past.
    const id = setTimeout(() => setProceed(true), 550);
    return () => clearTimeout(id);
  }, [allSettled, proceed]);

  useEffect(() => {
    if (proceed) navigate(from, { replace: true });
  }, [proceed, navigate, from]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Token was rejected — the session it belongs to is no longer valid.
  if (session === "fail") return <Navigate to="/login" replace />;

  const onlineCount = status?.services.filter((s) => s.online).length ?? 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-sm border border-accent/40 bg-accent/10">
            <Radar className="h-5 w-5 animate-pulse-soft text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-ink">DefenseOSINT</p>
            <p className="metadata">INITIALIZING SESSION // {username?.toUpperCase()}</p>
          </div>
        </div>

        <div className="panel divide-y divide-line overflow-hidden p-0">
          <CheckRow
            label="Analyst Session"
            state={session}
            // "fail" already redirects to /login above, so only pending/ok
            // are ever rendered here.
            detail={session === "ok" ? "verified" : undefined}
          />
          <CheckRow
            label="Gateway Uplink"
            state={gateway}
            detail={gateway === "ok" ? "online" : gateway === "fail" ? "unreachable" : undefined}
          />
          <CheckRow
            label="Agent Mesh"
            state={mesh}
            detail={status ? `${onlineCount}/${status.services.length} online` : undefined}
          />

          {status && (
            <div className="space-y-1 bg-base/40 px-4 py-3">
              {status.services.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between font-mono text-2xs"
                >
                  <span className={s.online ? "text-muted" : "text-critical"}>
                    {AGENT_LABEL.get(s.name as AgentId) ?? s.name}
                  </span>
                  <span className={s.online ? "text-verified" : "text-critical"}>
                    {s.online ? `${s.latency_ms}ms` : "OFFLINE"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {meshError && !status && (
          <p className="mt-3 rounded-sm border border-critical/40 bg-critical/10 px-2.5 py-1.5 text-xs text-critical">
            {meshError}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={logout}
            className="metadata text-dim transition-colors hover:text-muted"
          >
            cancel / sign out
          </button>
          <Button
            variant="default"
            disabled={!allSettled}
            onClick={() => setProceed(true)}
          >
            {allSettled ? "ENTER CONSOLE" : "INITIALIZING…"}
          </Button>
        </div>
      </div>
    </div>
  );
}
