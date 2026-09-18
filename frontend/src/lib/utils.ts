import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-style class combiner: conditional classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

export function formatStamp(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ") + "Z";
}
