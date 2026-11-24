import type { Config } from "@netlify/functions";
import type { Day, DaySummary, Exercise, Session, SetEntry } from "../../shared/types";
import { query, sql } from "../lib/db";
import {
  HttpError,
  json,
  noContent,
  parseDate,
  parseId,
  parseName,
  parseReps,
  parseUnit,
  parseWeight,
  pgCode,
  readBody,
} from "../lib/http";
import {
  createRoutine,
  createRoutineWorkout,
  deleteRoutine,
  deleteRoutineWorkout,
  getRoutineWorkout,
  listRoutines,
  loadRoutineWorkout,
  renameRoutine,
  updateRoutineWorkout,
} from "../lib/routines";

// Single function serving every /api/* route.
//
//   GET    /api/day?date=YYYY-MM-DD        the day's plan (routine workout) and logged sets
//   PUT    /api/day                        { date, routineWorkoutId | null }  choose the day's plan
//   DELETE /api/day?date=YYYY-MM-DD        clear the day: its plan and all its sets
//   GET    /api/history                    recent workout days
//
//   GET    /api/exercises                  all exercises
//   POST   /api/exercises                  { name }
//   DELETE /api/exercises/:id              removes the exercise and its sets
//   GET    /api/exercises/:id/sessions     past sessions for one exercise
//
//   POST   /api/sets                       { date, exerciseId, reps, weight, unit }
//   PATCH  /api/sets/:id                   { reps, weight, unit }
//   DELETE /api/sets/:id
//
//   GET    /api/routines                   routines with their workouts and exercises
//   POST   /api/routines                   { name }
//   PATCH  /api/routines/:id               { name }
//   DELETE /api/routines/:id               also deletes its workouts (logged history is kept)
//   POST   /api/routines/:id/workouts      { name }
//   GET    /api/routine-workouts/:id
//   PATCH  /api/routine-workouts/:id       { name?, exercises?: [{ exerciseId, targetSets, targetReps }] }
//   DELETE /api/routine-workouts/:id

// ---- day / history ---------------------------------------------------------

const SET_COLUMNS = `s.id, s.exercise_id AS "exerciseId", e.name AS "exerciseName",
  s.reps, s.weight::float8 AS weight, s.unit`;

async function getDay(url: URL) {
  const date = parseDate(url.searchParams.get("date"));
  const [sets, [workout]] = await Promise.all([
    query<SetEntry>(
      `SELECT ${SET_COLUMNS}
         FROM sets s
         JOIN workouts w ON w.id = s.workout_id
         JOIN exercises e ON e.id = s.exercise_id
        WHERE w.performed_on = $1
        ORDER BY s.created_at, s.id`,
      [date],
    ),
    query<{ routineWorkoutId: number | null }>(
      `SELECT routine_workout_id AS "routineWorkoutId" FROM workouts WHERE performed_on = $1`,
      [date],
    ),
  ]);
  const plan = workout?.routineWorkoutId ? await loadRoutineWorkout(workout.routineWorkoutId) : null;
  return json({ date, plan, sets } satisfies Day);
}

async function setDayPlan(req: Request) {
  const body = await readBody(req);
  const date = parseDate(body.date);
  const routineWorkoutId = body.routineWorkoutId === null ? null : parseId(body.routineWorkoutId);
  try {
    await sql()`
      INSERT INTO workouts (performed_on, routine_workout_id) VALUES (${date}, ${routineWorkoutId})
      ON CONFLICT (performed_on) DO UPDATE SET routine_workout_id = EXCLUDED.routine_workout_id`;
  } catch (error) {
    if (pgCode(error) === "23503") throw new HttpError(422, "That workout no longer exists");
    throw error;
  }
  return json(routineWorkoutId ? await loadRoutineWorkout(routineWorkoutId) : null);
}

/** Clear a day: removes its plan and every set logged on it. Idempotent. */
async function deleteDay(url: URL) {
  const date = parseDate(url.searchParams.get("date"));
  await sql()`DELETE FROM workouts WHERE performed_on = ${date}`; // sets cascade
  return noContent();
}

async function getHistory() {
  const rows = await sql()`
    SELECT w.performed_on::text AS date,
           count(s.id)::int AS sets,
           array_agg(DISTINCT e.name ORDER BY e.name) AS exercises,
           CASE WHEN rw.id IS NULL THEN NULL ELSE r.name || ' · ' || rw.name END AS plan
      FROM workouts w
      JOIN sets s ON s.workout_id = w.id
      JOIN exercises e ON e.id = s.exercise_id
      LEFT JOIN routine_workouts rw ON rw.id = w.routine_workout_id
      LEFT JOIN routines r ON r.id = rw.routine_id
     GROUP BY w.id, rw.id, r.id
     ORDER BY w.performed_on DESC
     LIMIT 200`;
  return json(rows as DaySummary[]);
}

// ---- exercises -------------------------------------------------------------

async function listExercises() {
  const rows = await sql()`
    SELECT e.id, e.name,
           max(w.performed_on)::text AS "lastDone",
           count(s.id)::int AS "totalSets"
      FROM exercises e
      LEFT JOIN sets s ON s.exercise_id = e.id
      LEFT JOIN workouts w ON w.id = s.workout_id
     GROUP BY e.id
     ORDER BY max(w.performed_on) DESC NULLS LAST, lower(e.name)`;
  return json(rows as Exercise[]);
}

async function createExercise(req: Request) {
  const name = parseName((await readBody(req)).name, "Exercise name");
  // Reuse an existing exercise with the same name (case-insensitive) instead of failing.
  const [row] = await sql()`
    INSERT INTO exercises (name) VALUES (${name})
    ON CONFLICT ((lower(name))) DO UPDATE SET name = exercises.name
    RETURNING id, name`;
  const [stats] = await sql()`
    SELECT max(w.performed_on)::text AS "lastDone", count(s.id)::int AS "totalSets"
      FROM sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ${row.id}`;
  return json({ ...row, ...stats } as Exercise, 201);
}

async function deleteExercise(id: number) {
  const rows = await sql()`DELETE FROM exercises WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) throw new HttpError(404, "Exercise not found");
  return noContent();
}

async function exerciseSessions(id: number) {
  const rows = await sql()`
    SELECT w.performed_on::text AS date, s.id, s.reps, s.weight::float8 AS weight, s.unit
      FROM sets s
      JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ${id}
     ORDER BY w.performed_on DESC, s.created_at, s.id
     LIMIT 500`;
  const sessions: Session[] = [];
  for (const { date, ...set } of rows as ({ date: string } & Session["sets"][number])[]) {
    const last = sessions.at(-1);
    if (last?.date === date) last.sets.push(set);
    else sessions.push({ date, sets: [set] });
  }
  return json(sessions);
}

// ---- sets ------------------------------------------------------------------

async function createSet(req: Request) {
  const body = await readBody(req);
  const date = parseDate(body.date);
  const exerciseId = parseId(body.exerciseId);
  const reps = parseReps(body.reps);
  const weight = parseWeight(body.weight);
  const unit = parseUnit(body.unit);
  try {
    const rows = await query<SetEntry>(
      `WITH w AS (
         INSERT INTO workouts (performed_on) VALUES ($1)
         ON CONFLICT (performed_on) DO UPDATE SET performed_on = EXCLUDED.performed_on
         RETURNING id
       ), s AS (
         INSERT INTO sets (workout_id, exercise_id, reps, weight, unit)
         SELECT w.id, $2, $3, $4, $5 FROM w
         RETURNING *
       )
       SELECT ${SET_COLUMNS} FROM s JOIN exercises e ON e.id = s.exercise_id`,
      [date, exerciseId, reps, weight, unit],
    );
    return json(rows[0], 201);
  } catch (error) {
    // 422 rather than 404: the URL is fine, the referenced exercise in the body isn't.
    if (pgCode(error) === "23503") throw new HttpError(422, "Exercise not found");
    throw error;
  }
}

async function updateSet(id: number, req: Request) {
  const body = await readBody(req);
  const reps = parseReps(body.reps);
  const weight = parseWeight(body.weight);
  const unit = parseUnit(body.unit);
  const rows = await query<SetEntry>(
    `WITH s AS (
       UPDATE sets SET reps = $2, weight = $3, unit = $4 WHERE id = $1 RETURNING *
     )
     SELECT ${SET_COLUMNS} FROM s JOIN exercises e ON e.id = s.exercise_id`,
    [id, reps, weight, unit],
  );
  if (rows.length === 0) throw new HttpError(404, "Set not found");
  return json(rows[0]);
}

async function deleteSet(id: number) {
  const rows = await sql()`DELETE FROM sets WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) throw new HttpError(404, "Set not found");
  return noContent();
}

// ---- router ----------------------------------------------------------------

async function route(req: Request, url: URL): Promise<Response | undefined> {
  const [resource, rawId, sub, ...rest] = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = req.method;
  if (rest.length > 0) return undefined;
  const id = () => parseId(rawId);

  switch (resource) {
    case "day":
      if (rawId) return undefined;
      if (method === "GET") return getDay(url);
      if (method === "PUT") return setDayPlan(req);
      if (method === "DELETE") return deleteDay(url);
      return undefined;

    case "history":
      return !rawId && method === "GET" ? getHistory() : undefined;

    case "exercises":
      if (!rawId) {
        if (method === "GET") return listExercises();
        if (method === "POST") return createExercise(req);
      } else {
        if (!sub && method === "DELETE") return deleteExercise(id());
        if (sub === "sessions" && method === "GET") return exerciseSessions(id());
      }
      return undefined;

    case "sets":
      if (!rawId && method === "POST") return createSet(req);
      if (rawId && !sub) {
        if (method === "PATCH") return updateSet(id(), req);
        if (method === "DELETE") return deleteSet(id());
      }
      return undefined;

    case "routines":
      if (!rawId) {
        if (method === "GET") return listRoutines();
        if (method === "POST") return createRoutine(req);
      } else if (!sub) {
        if (method === "PATCH") return renameRoutine(id(), req);
        if (method === "DELETE") return deleteRoutine(id());
      } else if (sub === "workouts" && method === "POST") {
        return createRoutineWorkout(id(), req);
      }
      return undefined;

    case "routine-workouts":
      if (!rawId || sub) return undefined;
      if (method === "GET") return getRoutineWorkout(id());
      if (method === "PATCH") return updateRoutineWorkout(id(), req);
      if (method === "DELETE") return deleteRoutineWorkout(id());
      return undefined;
  }
  return undefined;
}

export default async (req: Request) => {
  try {
    return (await route(req, new URL(req.url))) ?? json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
