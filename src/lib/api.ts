import type { DaySummary, Exercise, NewSetInput, Session, SetEntry, SetInput, StepDay } from "../../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
  } catch {
    throw new Error("You're offline. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  day: (date: string) => request<SetEntry[]>(`/day?date=${encodeURIComponent(date)}`),
  history: () => request<DaySummary[]>("/history"),
  exercises: () => request<Exercise[]>("/exercises"),
  createExercise: (name: string) => request<Exercise>("/exercises", send("POST", { name })),
  deleteExercise: (id: number) => request<void>(`/exercises/${id}`, send("DELETE")),
  sessions: (exerciseId: number) => request<Session[]>(`/exercises/${exerciseId}/sessions`),
  addSet: (input: NewSetInput) => request<SetEntry>("/sets", send("POST", input)),
  updateSet: (id: number, input: SetInput) => request<SetEntry>(`/sets/${id}`, send("PATCH", input)),
  deleteSet: (id: number) => request<void>(`/sets/${id}`, send("DELETE")),
  steps: (from: string, to: string) =>
    request<StepDay[]>(`/steps?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
