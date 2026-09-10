import { Navigate, Route, Routes } from "react-router-dom";
import BootSequence from "./components/BootSequence";
import ConsoleShell from "./layouts/ConsoleShell";
import InvestigationShell from "./layouts/InvestigationShell";
import AssessmentPage from "./pages/AssessmentPage";
import BriefPage from "./pages/BriefPage";
import EvidencePage from "./pages/EvidencePage";
import FabricPage from "./pages/FabricPage";
import LaunchPage from "./pages/LaunchPage";
import TaskingPage from "./pages/TaskingPage";
import TracePage from "./pages/TracePage";
import { InvestigationProvider, useInvestigation } from "./state/InvestigationContext";

function Boot() {
  const { gatewayChecked } = useInvestigation();
  return <BootSequence done={gatewayChecked} />;
}

export default function App() {
  return (
    <InvestigationProvider>
      <Boot />
      <Routes>
        <Route element={<ConsoleShell />}>
          <Route index element={<LaunchPage />} />
          <Route path="investigation/:id" element={<InvestigationShell />}>
            <Route index element={<Navigate to="fabric" replace />} />
            <Route path="fabric" element={<FabricPage />} />
            <Route path="tasking" element={<TaskingPage />} />
            <Route path="evidence" element={<EvidencePage />} />
            <Route path="assessment" element={<AssessmentPage />} />
            <Route path="brief" element={<BriefPage />} />
            <Route path="trace" element={<TracePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </InvestigationProvider>
  );
}
