import type { Investigation } from "./types";

// /api -> gateway, via the Vite dev proxy (see vite.config.ts). The gateway
// validates requests and forwards investigations to the planner, so the
// browser only ever talks to one service.
const GATEWAY_BASE = "/api";

export class ApiError extends Error {
  constructor(public status: number, public statusText: string, public body: string) {
    super(`${status} ${statusText}${body ? ` — ${body}` : ""}`);
    this.name = "ApiError";
  }
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
    });
  } catch (err) {
    throw new ApiError(0, "network error", err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, res.statusText, body);
  }
  return res.json() as Promise<T>;
}

export const getHealth = () => request<{ status: string }>(GATEWAY_BASE, "/health");

export const startInvestigation = (objective: string) =>
  request<{ investigation_id: string; status: string }>(GATEWAY_BASE, "/investigations", {
    method: "POST",
    body: JSON.stringify({ objective }),
  });

export const getInvestigation = (id: string) =>
  request<Investigation>(GATEWAY_BASE, `/investigations/${id}`);
