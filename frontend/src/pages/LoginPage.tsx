import { LockKeyhole, Radar } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button, Input } from "../components/ui/primitives";
import { useAuth } from "../state/AuthContext";

export default function LoginPage() {
  const { login, isAuthenticated, isChecking } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — don't show the login form. Also send the analyst
  // back where they were headed if RequireAuth redirected them here.
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      const from = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(from, { replace: true });
    } catch {
      setError("Invalid username or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-sm border border-accent/40 bg-accent/10">
            <Radar className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-ink">DefenseOSINT</p>
            <p className="metadata">ORCHESTRATION CONSOLE // SIGN IN</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="panel space-y-3 p-4">
          <div>
            <label htmlFor="username" className="metadata mb-1 block uppercase tracking-[0.12em]">
              Username
            </label>
            <Input
              id="username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting || isChecking}
            />
          </div>

          <div>
            <label htmlFor="password" className="metadata mb-1 block uppercase tracking-[0.12em]">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting || isChecking}
            />
          </div>

          {error && (
            <p className="rounded-sm border border-critical/40 bg-critical/10 px-2.5 py-1.5 text-xs text-critical">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="default"
            className="w-full"
            disabled={submitting || isChecking || !username || !password}
          >
            <LockKeyhole className="h-3.5 w-3.5" />
            {submitting ? "AUTHENTICATING…" : "SIGN IN"}
          </Button>
        </form>

        <p className="metadata mt-4 text-center">
          Authorized personnel only. This session is logged.
        </p>
      </div>
    </div>
  );
}
