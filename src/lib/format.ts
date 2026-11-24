import type { Unit } from "../../shared/types";

export const fmtWeight = (n: number) => String(Math.round(n * 100) / 100);

export const weightStep = (unit: Unit) => (unit === "kg" ? 2.5 : 5);

export const defaultWeight = (unit: Unit) => (unit === "kg" ? 20 : 45);

export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported (e.g. iOS Safari)
  }
}
