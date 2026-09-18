import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import RequireAuth from "./components/layout/RequireAuth";
import AgentActivityPage from "./pages/AgentActivityPage";
import AssessmentPage from "./pages/AssessmentPage";
import CollectionPage from "./pages/CollectionPage";
import EntitiesPage from "./pages/EntitiesPage";
import EvidenceExplorerPage from "./pages/EvidencePage";
import FeedPage from "./pages/FeedPage";
import GeospatialPage from "./pages/GeospatialPage";
import LoginPage from "./pages/LoginPage";
import MediaPage from "./pages/MediaPage";
import OverviewPage from "./pages/OverviewPage";
import ProvenancePage from "./pages/ProvenancePage";
import ReportsPage from "./pages/ReportsPage";
import { AuthProvider } from "./state/AuthContext";
import { InvestigationProvider } from "./state/InvestigationContext";

export default function App() {
  return (
    <AuthProvider>
      <InvestigationProvider>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="feed" element={<FeedPage />} />
            <Route path="collection" element={<CollectionPage />} />
            <Route path="entities" element={<EntitiesPage />} />
            <Route path="geoint" element={<GeospatialPage />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="evidence" element={<EvidenceExplorerPage />} />
            <Route path="provenance" element={<ProvenancePage />} />
            <Route path="assessment" element={<AssessmentPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="agents" element={<AgentActivityPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </InvestigationProvider>
    </AuthProvider>
  );
}
