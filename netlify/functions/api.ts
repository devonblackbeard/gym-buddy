import type { Config } from "@netlify/functions";
import type { Day, DaySummary, Exercise, Session, SetEntry } from "../../shared/types";
import { me, requireUser, signIn, signOut, signUp, withCookie } from "../lib/auth";
import { query } from "../lib/db";
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

// Single function serving every /api/* route. Everything except /api/auth/* requires a signed-in
// user (session cookie) and only sees that user's data. Handlers take the user's id as `uid`.
//
//   POST   /api/auth/signup                { email, password }  creates the account and signs in
//   POST   /api/auth/login                 { email, password }
//   POST   /api/auth/logout
//   GET    /api/auth/me                    { user }, or 401 when signed out
//
//   GET    /api/day?date=YYYY-MM-DD        the day's plan (routine workout) and logged sets
//   PUT    /api/day                        { date, routineWorkoutId | null, onlyIfEmpty? }  choose the day's plan;
//                                          with onlyIfEmpty, 409 if the day already has a plan or sets
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

async function getDay(uid: number, url: URL) {
  const date = parseDate(url.searchParams.get("date"));
  const [sets, [workout]] = await Promise.all([
    query<SetEntry>(
      `SELECT ${SET_COLUMNS}
         FROM sets s
         JOIN workouts w ON w.id = s.workout_id
         JOIN exercises e ON e.id = s.exercise_id
        WHERE w.user_id = $1 AND w.performed_on = $2
        ORDER BY s.created_at, s.id`,
      [uid, date],
    ),
    query<{ routineWorkoutId: number | null }>(
      `SELECT routine_workout_id AS "routineWorkoutId" FROM workouts WHERE user_id = $1 AND performed_on = $2`,
      [uid, date],
    ),
  ]);
  const plan = workout?.routineWorkoutId ? await loadRoutineWorkout(uid, workout.routineWorkoutId) : null;
  return json({ date, plan, sets } satisfies Day);
}

async function setDayPlan(uid: number, req: Request) {
  const body = await readBody(req);
  const date = parseDate(body.date);
  const routineWorkoutId = body.routineWorkoutId === null ? null : parseId(body.routineWorkoutId);
  const plan = routineWorkoutId === null ? null : await loadRoutineWorkout(uid, routineWorkoutId);
  if (routineWorkoutId !== null && !plan) throw new HttpError(422, "That workout no longer exists");
  if (body.onlyIfEmpty === true) {
    // Starting a workout never replaces one: the day must have no plan and no sets yet.
    const [taken] = await query(
      `SELECT 1 FROM workouts w
        WHERE w.user_id = $1 AND w.performed_on = $2
          AND (w.routine_workout_id IS NOT NULL OR EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = w.id))`,
      [uid, date],
    );
    if (taken) throw new HttpError(409, "You already have a workout on this day. Delete it first to start a new one.");
  }
  try {
    await query(
      `INSERT INTO workouts (user_id, performed_on, routine_workout_id) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, performed_on) DO UPDATE SET routine_workout_id = EXCLUDED.routine_workout_id`,
      [uid, date, routineWorkoutId],
    );
  } catch (error) {
    if (pgCode(error) === "23503") throw new HttpError(422, "That workout no longer exists");
    throw error;
  }
  return json(plan);
}

/** Clear a day: removes its plan and every set logged on it. Idempotent. */
async function deleteDay(uid: number, url: URL) {
  const date = parseDate(url.searchParams.get("date"));
  await query(`DELETE FROM workouts WHERE user_id = $1 AND performed_on = $2`, [uid, date]); // sets cascade
  return noContent();
}

async function getHistory(uid: number) {
  const rows = await query<DaySummary>(
    `SELECT w.performed_on::text AS date,
            count(s.id)::int AS sets,
            array_agg(DISTINCT e.name ORDER BY e.name) AS exercises,
            CASE WHEN rw.id IS NULL THEN NULL ELSE r.name || ' · ' || rw.name END AS plan
       FROM workouts w
       JOIN sets s ON s.workout_id = w.id
       JOIN exercises e ON e.id = s.exercise_id
       LEFT JOIN routine_workouts rw ON rw.id = w.routine_workout_id
       LEFT JOIN routines r ON r.id = rw.routine_id
      WHERE w.user_id = $1
      GROUP BY w.id, rw.id, r.id
      ORDER BY w.performed_on DESC
      LIMIT 200`,
    [uid],
  );
  return json(rows);
}

// ---- exercises -------------------------------------------------------------

async function listExercises(uid: number) {
  const rows = await query<Exercise>(
    `SELECT e.id, e.name,
            max(w.performed_on)::text AS "lastDone",
            count(s.id)::int AS "totalSets"
       FROM exercises e
       LEFT JOIN sets s ON s.exercise_id = e.id
       LEFT JOIN workouts w ON w.id = s.workout_id
      WHERE e.user_id = $1
      GROUP BY e.id
      ORDER BY max(w.performed_on) DESC NULLS LAST, lower(e.name)`,
    [uid],
  );
  return json(rows);
}

async function createExercise(uid: number, req: Request) {
  const name = parseName((await readBody(req)).name, "Exercise name");
  // Reuse the user's existing exercise with the same name (case-insensitive) instead of failing.
  const [row] = await query<{ id: number; name: string }>(
    `INSERT INTO exercises (user_id, name) VALUES ($1, $2)
     ON CONFLICT (user_id, (lower(name))) DO UPDATE SET name = exercises.name
     RETURNING id, name`,
    [uid, name],
  );
  const [stats] = await query<Pick<Exercise, "lastDone" | "totalSets">>(
    `SELECT max(w.performed_on)::text AS "lastDone", count(s.id)::int AS "totalSets"
       FROM sets s JOIN workouts w ON w.id = s.workout_id
      WHERE s.exercise_id = $1`,
    [row.id],
  );
  return json({ ...row, ...stats } satisfies Exercise, 201);
}

async function deleteExercise(uid: number, id: number) {
  const rows = await query(`DELETE FROM exercises WHERE id = $1 AND user_id = $2 RETURNING id`, [id, uid]);
  if (rows.length === 0) throw new HttpError(404, "Exercise not found");
  return noContent();
}

async function exerciseSessions(uid: number, id: number) {
  const rows = await query<{ date: string } & Session["sets"][number]>(
    `SELECT w.performed_on::text AS date, s.id, s.reps, s.weight::float8 AS weight, s.unit
       FROM sets s
       JOIN workouts w ON w.id = s.workout_id
      WHERE s.exercise_id = $1 AND w.user_id = $2
      ORDER BY w.performed_on DESC, s.created_at, s.id
      LIMIT 500`,
    [id, uid],
  );
  const sessions: Session[] = [];
  for (const { date, ...set } of rows) {
    const last = sessions.at(-1);
    if (last?.date === date) last.sets.push(set);
    else sessions.push({ date, sets: [set] });
  }
  return json(sessions);
}

// ---- sets ------------------------------------------------------------------

async function createSet(uid: number, req: Request) {
  const body = await readBody(req);
  const date = parseDate(body.date);
  const exerciseId = parseId(body.exerciseId);
  const reps = parseReps(body.reps);
  const weight = parseWeight(body.weight);
  const unit = parseUnit(body.unit);
  // 422 rather than 404: the URL is fine, the referenced exercise in the body isn't.
  const [owned] = await query(`SELECT 1 FROM exercises WHERE id = $1 AND user_id = $2`, [exerciseId, uid]);
  if (!owned) throw new HttpError(422, "Exercise not found");
  try {
    const rows = await query<SetEntry>(
      `WITH w AS (
         INSERT INTO workouts (user_id, performed_on) VALUES ($6, $1)
         ON CONFLICT (user_id, performed_on) DO UPDATE SET performed_on = EXCLUDED.performed_on
         RETURNING id
       ), s AS (
         INSERT INTO sets (workout_id, exercise_id, reps, weight, unit)
         SELECT w.id, $2, $3, $4, $5 FROM w
         RETURNING *
       )
       SELECT ${SET_COLUMNS} FROM s JOIN exercises e ON e.id = s.exercise_id`,
      [date, exerciseId, reps, weight, unit, uid],
    );
    return json(rows[0], 201);
  } catch (error) {
    if (pgCode(error) === "23503") throw new HttpError(422, "Exercise not found"); // deleted meanwhile
    throw error;
  }
}

async function updateSet(uid: number, id: number, req: Request) {
  const body = await readBody(req);
  const reps = parseReps(body.reps);
  const weight = parseWeight(body.weight);
  const unit = parseUnit(body.unit);
  const rows = await query<SetEntry>(
    `WITH s AS (
       UPDATE sets SET reps = $2, weight = $3, unit = $4
         FROM workouts w
        WHERE sets.id = $1 AND w.id = sets.workout_id AND w.user_id = $5
       RETURNING sets.*
     )
     SELECT ${SET_COLUMNS} FROM s JOIN exercises e ON e.id = s.exercise_id`,
    [id, reps, weight, unit, uid],
  );
  if (rows.length === 0) throw new HttpError(404, "Set not found");
  return json(rows[0]);
}

async function deleteSet(uid: number, id: number) {
  const rows = await query(
    `DELETE FROM sets s USING workouts w
      WHERE s.id = $1 AND w.id = s.workout_id AND w.user_id = $2
      RETURNING s.id`,
    [id, uid],
  );
  if (rows.length === 0) throw new HttpError(404, "Set not found");
  return noContent();
}

// ---- router ----------------------------------------------------------------

async function route(req: Request, url: URL, uid: number): Promise<Response | undefined> {
  const [resource, rawId, sub, ...rest] = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = req.method;
  if (rest.length > 0) return undefined;
  const id = () => parseId(rawId);

  switch (resource) {
    case "day":
      if (rawId) return undefined;
      if (method === "GET") return getDay(uid, url);
      if (method === "PUT") return setDayPlan(uid, req);
      if (method === "DELETE") return deleteDay(uid, url);
      return undefined;

    case "history":
      return !rawId && method === "GET" ? getHistory(uid) : undefined;

    case "exercises":
      if (!rawId) {
        if (method === "GET") return listExercises(uid);
        if (method === "POST") return createExercise(uid, req);
      } else {
        if (!sub && method === "DELETE") return deleteExercise(uid, id());
        if (sub === "sessions" && method === "GET") return exerciseSessions(uid, id());
      }
      return undefined;

    case "sets":
      if (!rawId && method === "POST") return createSet(uid, req);
      if (rawId && !sub) {
        if (method === "PATCH") return updateSet(uid, id(), req);
        if (method === "DELETE") return deleteSet(uid, id());
      }
      return undefined;

    case "routines":
      if (!rawId) {
        if (method === "GET") return listRoutines(uid);
        if (method === "POST") return createRoutine(uid, req);
      } else if (!sub) {
        if (method === "PATCH") return renameRoutine(uid, id(), req);
        if (method === "DELETE") return deleteRoutine(uid, id());
      } else if (sub === "workouts" && method === "POST") {
        return createRoutineWorkout(uid, id(), req);
      }
      return undefined;

    case "routine-workouts":
      if (!rawId || sub) return undefined;
      if (method === "GET") return getRoutineWorkout(uid, id());
      if (method === "PATCH") return updateRoutineWorkout(uid, id(), req);
      if (method === "DELETE") return deleteRoutineWorkout(uid, id());
      return undefined;
  }
  return undefined;
}

/** Account routes, the only ones that work signed out. */
function authRoute(req: Request, action: string | undefined): Promise<Response> | undefined {
  if (action === "me" && req.method === "GET") return me(req);
  if (req.method !== "POST") return undefined;
  if (action === "signup") return signUp(req);
  if (action === "login") return signIn(req);
  if (action === "logout") return signOut(req);
  return undefined;
}

async function handle(req: Request, url: URL): Promise<Response | undefined> {
  // Session cookies are SameSite=Lax; additionally refuse writes sent from another site.
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && req.method !== "HEAD" && origin && origin !== url.origin) {
    throw new HttpError(403, "Request blocked");
  }

  const [resource, action, ...rest] = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  if (resource === "auth") return rest.length === 0 ? authRoute(req, action) : undefined;

  const auth = await requireUser(req);
  const response = await route(req, url, auth.userId);
  return response && auth.renewCookie ? withCookie(response, auth.renewCookie) : response;
}

export default async (req: Request) => {
  try {
    return (await handle(req, new URL(req.url))) ?? json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
