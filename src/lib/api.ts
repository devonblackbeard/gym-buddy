import type {
  Day,
  DaySummary,
  Exercise,
  NewSetInput,
  Routine,
  RoutineExerciseInput,
  RoutineWorkout,
  Session,
  SetEntry,
  SetInput,
  User,
} from "../../shared/types";

const SIGNED_OUT = "app:signed-out";

/** Fires when the server says the session is gone (expired, or signed out elsewhere). */
export function onSignedOut(listener: () => void) {
  window.addEventListener(SIGNED_OUT, listener);
  return () => window.removeEventListener(SIGNED_OUT, listener);
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

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
  if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event(SIGNED_OUT));
  if (!res.ok) throw new HttpError(res.status, body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  /** The signed-in user, or null when signed out. Throws when offline. */
  me: () =>
    request<{ user: User }>("/auth/me").then(
      (r) => r.user,
      (e: unknown) => {
        if (e instanceof HttpError && e.status === 401) return null;
        throw e;
      },
    ),
  signUp: (email: string, password: string) =>
    request<{ user: User }>("/auth/signup", send("POST", { email, password })).then((r) => r.user),
  signIn: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", send("POST", { email, password })).then((r) => r.user),
  signOut: () => request<void>("/auth/logout", send("POST")),

  day: (date: string) => request<Day>(`/day?date=${encodeURIComponent(date)}`),
  setDayPlan: (date: string, routineWorkoutId: number | null) =>
    request<RoutineWorkout | null>("/day", send("PUT", { date, routineWorkoutId })),
  /** Start a routine workout on a day that has nothing yet; fails (409) instead of replacing one. */
  startDay: (date: string, routineWorkoutId: number) =>
    request<RoutineWorkout>("/day", send("PUT", { date, routineWorkoutId, onlyIfEmpty: true })),
  deleteDay: (date: string) => request<void>(`/day?date=${encodeURIComponent(date)}`, send("DELETE")),
  history: () => request<DaySummary[]>("/history"),

  routines: () => request<Routine[]>("/routines"),
  createRoutine: (name: string) => request<Routine>("/routines", send("POST", { name })),
  renameRoutine: (id: number, name: string) => request<void>(`/routines/${id}`, send("PATCH", { name })),
  deleteRoutine: (id: number) => request<void>(`/routines/${id}`, send("DELETE")),
  createRoutineWorkout: (routineId: number, name: string) =>
    request<RoutineWorkout>(`/routines/${routineId}/workouts`, send("POST", { name })),
  routineWorkout: (id: number) => request<RoutineWorkout>(`/routine-workouts/${id}`),
  updateRoutineWorkout: (id: number, changes: { name?: string; exercises?: RoutineExerciseInput[] }) =>
    request<RoutineWorkout>(`/routine-workouts/${id}`, send("PATCH", changes)),
  deleteRoutineWorkout: (id: number) => request<void>(`/routine-workouts/${id}`, send("DELETE")),

  exercises: () => request<Exercise[]>("/exercises"),
  createExercise: (name: string) => request<Exercise>("/exercises", send("POST", { name })),
  deleteExercise: (id: number) => request<void>(`/exercises/${id}`, send("DELETE")),
  sessions: (exerciseId: number) => request<Session[]>(`/exercises/${exerciseId}/sessions`),
  addSet: (input: NewSetInput) => request<SetEntry>("/sets", send("POST", input)),
  updateSet: (id: number, input: SetInput) => request<SetEntry>(`/sets/${id}`, send("PATCH", input)),
  deleteSet: (id: number) => request<void>(`/sets/${id}`, send("DELETE")),
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
