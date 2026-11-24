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
} from "../../shared/types";

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
  day: (date: string) => request<Day>(`/day?date=${encodeURIComponent(date)}`),
  setDayPlan: (date: string, routineWorkoutId: number | null) =>
    request<RoutineWorkout | null>("/day", send("PUT", { date, routineWorkoutId })),
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
