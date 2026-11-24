import type { Config } from "@netlify/functions";
import { query, sql } from "../lib/db";
import type { DaySummary, Exercise, Session, SetEntry, Unit } from "../../shared/types";

// Single function serving every /api/* route.
//
//   GET    /api/day?date=YYYY-MM-DD      sets logged on a day
//   GET    /api/history                  recent workout days
//   GET    /api/exercises                all exercises
//   POST   /api/exercises                { name }
//   DELETE /api/exercises/:id            removes the exercise and its sets
//   GET    /api/exercises/:id/sessions   past sessions for one exercise
//   POST   /api/sets                     { date, exerciseId, reps, weight, unit }
//   PATCH  /api/sets/:id                 { reps, weight, unit }
//   DELETE /api/sets/:id

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// ---- input validation ------------------------------------------------------

function parseDate(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))) {
    return value;
  }
  throw new HttpError(400, "Invalid date, expected YYYY-MM-DD");
}

function parseId(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n === "number" && Number.isInteger(n) && n > 0) return n;
  throw new HttpError(400, "Invalid id");
}

function parseReps(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1000) return value;
  throw new HttpError(400, "Reps must be a whole number between 0 and 1000");
}

function parseWeight(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5000) {
    return Math.round(value * 100) / 100;
  }
  throw new HttpError(400, "Weight must be between 0 and 5000");
}

function parseUnit(value: unknown): Unit {
  if (value === "lb" || value === "kg") return value;
  throw new HttpError(400, "Unit must be lb or kg");
}

function parseName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length > 0 && name.length <= 80) return name;
  throw new HttpError(400, "Exercise name must be 1–80 characters");
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, "Expected a JSON object body");
}

/** Postgres error code (e.g. 23503 = foreign key violation), also when wrapped by the driver. */
function pgCode(error: unknown): string | undefined {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 3; depth++) {
    if ("code" in e && typeof e.code === "string") return e.code;
    e = "cause" in e ? e.cause : undefined;
  }
  return undefined;
}

// ---- handlers --------------------------------------------------------------

const SET_COLUMNS = `s.id, s.exercise_id AS "exerciseId", e.name AS "exerciseName",
  s.reps, s.weight::float8 AS weight, s.unit`;

async function getDay(url: URL) {
  const date = parseDate(url.searchParams.get("date"));
  const rows = await query(
    `SELECT ${SET_COLUMNS}
       FROM sets s
       JOIN workouts w ON w.id = s.workout_id
       JOIN exercises e ON e.id = s.exercise_id
      WHERE w.performed_on = $1
      ORDER BY s.created_at, s.id`,
    [date],
  );
  return json(rows as SetEntry[]);
}

async function getHistory() {
  const rows = await sql()`
    SELECT w.performed_on::text AS date,
           count(s.id)::int AS sets,
           array_agg(DISTINCT e.name ORDER BY e.name) AS exercises
      FROM workouts w
      JOIN sets s ON s.workout_id = w.id
      JOIN exercises e ON e.id = s.exercise_id
     GROUP BY w.id
     ORDER BY w.performed_on DESC
     LIMIT 200`;
  return json(rows as DaySummary[]);
}

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
  const name = parseName((await readBody(req)).name);
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
  return new Response(null, { status: 204 });
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

async function createSet(req: Request) {
  const body = await readBody(req);
  const date = parseDate(body.date);
  const exerciseId = parseId(body.exerciseId);
  const reps = parseReps(body.reps);
  const weight = parseWeight(body.weight);
  const unit = parseUnit(body.unit);
  try {
    const rows = await query(
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
    return json(rows[0] as SetEntry, 201);
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
  const rows = await query(
    `WITH s AS (
       UPDATE sets SET reps = $2, weight = $3, unit = $4 WHERE id = $1 RETURNING *
     )
     SELECT ${SET_COLUMNS} FROM s JOIN exercises e ON e.id = s.exercise_id`,
    [id, reps, weight, unit],
  );
  if (rows.length === 0) throw new HttpError(404, "Set not found");
  return json(rows[0] as SetEntry);
}

async function deleteSet(id: number) {
  const rows = await sql()`DELETE FROM sets WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) throw new HttpError(404, "Set not found");
  return new Response(null, { status: 204 });
}

// ---- router ----------------------------------------------------------------

async function route(req: Request, url: URL): Promise<Response> {
  const [resource, rawId, sub, ...rest] = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = req.method;
  if (rest.length > 0) throw new HttpError(404, "Not found");

  if (resource === "day" && !rawId && method === "GET") return getDay(url);
  if (resource === "history" && !rawId && method === "GET") return getHistory();

  if (resource === "exercises") {
    if (!rawId) {
      if (method === "GET") return listExercises();
      if (method === "POST") return createExercise(req);
    } else {
      const id = parseId(rawId);
      if (!sub && method === "DELETE") return deleteExercise(id);
      if (sub === "sessions" && method === "GET") return exerciseSessions(id);
    }
  }

  if (resource === "sets") {
    if (!rawId && method === "POST") return createSet(req);
    if (rawId && !sub) {
      const id = parseId(rawId);
      if (method === "PATCH") return updateSet(id, req);
      if (method === "DELETE") return deleteSet(id);
    }
  }

  throw new HttpError(404, "Not found");
}

export default async (req: Request) => {
  try {
    return await route(req, new URL(req.url));
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
