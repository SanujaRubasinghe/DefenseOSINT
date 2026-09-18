import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../state/AuthContext";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isChecking } = useAuth();
  const location = useLocation();

  // While a stored session is being verified against /auth/me, render
  // nothing rather than bouncing to /login and immediately back.
  if (isChecking) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
