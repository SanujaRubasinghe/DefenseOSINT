import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import StatusPill from "../components/StatusPill";
import StageNav from "../components/StageNav";
import { useInvestigation } from "../state/InvestigationContext";

export default function InvestigationShell() {
  const { id } = useParams<{ id: string }>();
  const { investigation, ensureLoaded, loadError, isLive } = useInvestigation();

  useEffect(() => {
    if (id) ensureLoaded(id);
  }, [id, ensureLoaded]);

  const loaded = investigation && investigation.investigation_id === id ? investigation : null;

  return (
    <div className="run">
      <div className="run-bar">
        <div className="run-identity">
          <span className="run-label">RUN</span>
          <span className="run-id">{id}</span>
          {loaded && <StatusPill value={loaded.status} />}
          {isLive && <span className="run-live">● LIVE</span>}
        </div>
        {loaded && <p className="run-objective">{loaded.objective}</p>}
      </div>

      <StageNav investigation={loaded} />

      {loadError && <div className="error-banner">UPLINK: {loadError}</div>}

      {!loaded && !loadError ? (
        <p className="empty-note">LOADING RUN {id}…</p>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
