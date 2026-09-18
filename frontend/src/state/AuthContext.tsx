import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, getMe, login as apiLogin, setAuthToken, setUnauthorizedHandler } from "../api/client";

const STORAGE_KEY = "defenseosint.session";

interface StoredSession {
  token: string;
  username: string;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private browsing, quota) — the session
    // still works for the current tab via in-memory state, it just won't
    // survive a refresh.
  }
}

interface AuthState {
  username: string | null;
  isAuthenticated: boolean;
  /** True until the stored session (if any) has been verified against the
   * gateway, so route guards don't flash the login page on every refresh. */
  isChecking: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(() => {
    setAuthToken(null);
    saveSession(null);
    setUsername(null);
  }, []);

  // A 401 from any request (expired/revoked token) drops back to logged-out
  // state, wherever in the app it happens.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Rehydrate on load: a stored token is trusted optimistically, then
  // verified against /auth/me — an expired token gets cleared instead of
  // silently failing every request afterwards.
  useEffect(() => {
    const stored = loadSession();
    if (!stored) {
      setIsChecking(false);
      return;
    }
    setAuthToken(stored.token);
    setUsername(stored.username);
    getMe()
      .catch(() => logout())
      .finally(() => setIsChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    setError(null);
    try {
      const result = await apiLogin(user, password);
      setAuthToken(result.access_token);
      saveSession({ token: result.access_token, username: result.username });
      setUsername(result.username);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 401
            ? "Invalid username or password."
            : err.message
          : String(err);
      setError(message);
      throw err;
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      username,
      isAuthenticated: !!username,
      isChecking,
      error,
      login,
      logout,
    }),
    [username, isChecking, error, login, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
