import { Link, Outlet } from "react-router-dom";
import Clock from "../components/Clock";
import ConsoleBackdrop from "../components/ConsoleBackdrop";
import { useInvestigation } from "../state/InvestigationContext";

export default function ConsoleShell() {
  const { gatewayStatus, networkOnline } = useInvestigation();

  return (
    <>
      <ConsoleBackdrop />
      <div className="console">
        <header className="console-header">
          <div className="console-header-left">
            <span className={`status-dot ${networkOnline ? "status-dot-ok" : "status-dot-err"}`} />
            <Link to="/" className="console-wordmark-link">
              <span className="console-wordmark">DEFENSEOSINT</span>
            </Link>
            <span className="console-subtitle">// ORCHESTRATION CONSOLE</span>
          </div>
          <div className="console-header-right">
            <span className="console-gateway">
              GATEWAY:{" "}
              <strong className={networkOnline ? "text-ok" : "text-err"}>
                {gatewayStatus.toUpperCase()}
              </strong>
            </span>
            <Clock />
          </div>
        </header>

        <Outlet />
      </div>
    </>
  );
}
