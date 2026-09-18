import type { Investigation } from "./types";

// /api -> gateway, via the Vite dev proxy (see vite.config.ts). The gateway
// authenticates the analyst, validates requests, and forwards investigations
// to the planner, so the browser only ever talks to one service.
const GATEWAY_BASE = "/api";

export class ApiError extends Error {
  constructor(public status: number, public statusText: string, public body: string) {
    super(`${status} ${statusText}${body ? ` — ${body}` : ""}`);
    this.name = "ApiError";
  }
}

// Held in memory rather than threaded through every call site. AuthProvider
// is the only thing that calls setAuthToken; every other module just calls
// the API functions below and gets the header attached automatically.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Registered once by AuthProvider so an expired/revoked token clears auth
 * state no matter which page triggered the 401. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init?.headers || {}),
      },
      ...init,
    });
  } catch (err) {
    throw new ApiError(0, "network error", err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, res.statusText, body);
  }
  return res.json() as Promise<T>;
}

export const getHealth = () => request<{ status: string }>(GATEWAY_BASE, "/health");

export interface LoginResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  username: string;
}

export const login = (username: string, password: string) =>
  request<LoginResult>(GATEWAY_BASE, "/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const getMe = () => request<{ username: string }>(GATEWAY_BASE, "/auth/me");

export interface ServiceStatus {
  name: string;
  online: boolean;
  latency_ms: number | null;
}

export interface SystemStatus {
  services: ServiceStatus[];
  all_online: boolean;
}

/** Pings every agent's real /health through the gateway — used by the
 * post-login initialization screen. */
export const getSystemStatus = () => request<SystemStatus>(GATEWAY_BASE, "/system/status");

export const startInvestigation = (objective: string) =>
  request<{ investigation_id: string; status: string }>(GATEWAY_BASE, "/investigations", {
    method: "POST",
    body: JSON.stringify({ objective }),
  });

export const getInvestigation = (id: string) =>
  request<Investigation>(GATEWAY_BASE, `/investigations/${id}`);
