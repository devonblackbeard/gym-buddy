import type { Unit } from "../../shared/types";

// Request/response helpers and input validation shared by the API handlers.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const noContent = () => new Response(null, { status: 204 });

export function parseDate(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))) {
    return value;
  }
  throw new HttpError(400, "Invalid date, expected YYYY-MM-DD");
}

export function parseId(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n === "number" && Number.isInteger(n) && n > 0) return n;
  throw new HttpError(400, "Invalid id");
}

function intBetween(value: unknown, min: number, max: number, message: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) return value;
  throw new HttpError(400, message);
}

export const parseReps = (value: unknown) =>
  intBetween(value, 0, 1000, "Reps must be a whole number between 0 and 1000");

/** Optional target: null/undefined means "no target". */
export function parseTarget(value: unknown, max: number, label: string): number | null {
  if (value === null || value === undefined) return null;
  return intBetween(value, 1, max, `${label} must be a whole number between 1 and ${max}`);
}

export function parseWeight(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5000) {
    return Math.round(value * 100) / 100;
  }
  throw new HttpError(400, "Weight must be between 0 and 5000");
}

export function parseUnit(value: unknown): Unit {
  if (value === "lb" || value === "kg") return value;
  throw new HttpError(400, "Unit must be lb or kg");
}

export function parseName(value: unknown, label = "Name"): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length > 0 && name.length <= 80) return name;
  throw new HttpError(400, `${label} must be 1–80 characters`);
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, "Expected a JSON object body");
}

/** Postgres error code (23503 = foreign key, 23505 = unique), also when wrapped by the driver. */
export function pgCode(error: unknown): string | undefined {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 3; depth++) {
    if ("code" in e && typeof e.code === "string") return e.code;
    e = "cause" in e ? e.cause : undefined;
  }
  return undefined;
}

// Note: `netlify dev` retries a 404 from a function as .html / index.html paths, which garbles the
// message locally. 404 is still used for unknown URLs/ids; body problems use 400/409/422.
