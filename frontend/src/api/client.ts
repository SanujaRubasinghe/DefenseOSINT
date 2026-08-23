// All requests go through the Vite proxy (/api -> gateway).
const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const getHealth = () => request<{ status: string }>("/health");

export const startInvestigation = (objective: string) =>
  request<{ investigation_id: string }>("/investigations", {
    method: "POST",
    body: JSON.stringify({ objective }),
  });

export const getInvestigation = (id: string) =>
  request<unknown>(`/investigations/${id}`);
