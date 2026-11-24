import type { Routine, RoutineExercise, RoutineExerciseInput, RoutineWorkout } from "../../shared/types";
import { query, sql } from "./db";
import { HttpError, json, noContent, parseId, parseName, parseTarget, pgCode, readBody } from "./http";

// Routines (Push, Pull, Legs) → routine workouts (Alpha, Beta) → ordered exercises with optional targets.

type ExerciseRow = RoutineExercise & { workoutId: number };

async function exercisesFor(workoutIds: number[]): Promise<ExerciseRow[]> {
  if (workoutIds.length === 0) return [];
  return query<ExerciseRow>(
    `SELECT rwe.routine_workout_id AS "workoutId", rwe.exercise_id AS "exerciseId", e.name,
            rwe.target_sets AS "targetSets", rwe.target_reps AS "targetReps"
       FROM routine_workout_exercises rwe
       JOIN exercises e ON e.id = rwe.exercise_id
      WHERE rwe.routine_workout_id = ANY($1::int[])
      ORDER BY rwe.position, rwe.id`,
    [workoutIds],
  );
}

function attachExercises(
  workouts: Omit<RoutineWorkout, "exercises">[],
  rows: ExerciseRow[],
): RoutineWorkout[] {
  return workouts.map((w) => ({
    ...w,
    exercises: rows.filter((r) => r.workoutId === w.id).map(({ workoutId: _, ...exercise }) => exercise),
  }));
}

/** One routine workout with its routine name and exercises, or null if it doesn't exist. */
export async function loadRoutineWorkout(id: number): Promise<RoutineWorkout | null> {
  const [workout] = await query<Omit<RoutineWorkout, "exercises">>(
    `SELECT rw.id, rw.routine_id AS "routineId", r.name AS "routineName", rw.name
       FROM routine_workouts rw JOIN routines r ON r.id = rw.routine_id
      WHERE rw.id = $1`,
    [id],
  );
  if (!workout) return null;
  return attachExercises([workout], await exercisesFor([id]))[0];
}

export async function listRoutines() {
  const [routines, workouts] = await Promise.all([
    query<{ id: number; name: string }>(`SELECT id, name FROM routines ORDER BY position, id`),
    query<Omit<RoutineWorkout, "exercises">>(
      `SELECT rw.id, rw.routine_id AS "routineId", r.name AS "routineName", rw.name
         FROM routine_workouts rw JOIN routines r ON r.id = rw.routine_id
        ORDER BY rw.position, rw.id`,
    ),
  ]);
  const full = attachExercises(workouts, await exercisesFor(workouts.map((w) => w.id)));
  const result: Routine[] = routines.map((r) => ({ ...r, workouts: full.filter((w) => w.routineId === r.id) }));
  return json(result);
}

function duplicateName(error: unknown, message: string): never {
  if (pgCode(error) === "23505") throw new HttpError(409, message);
  throw error;
}

export async function createRoutine(req: Request) {
  const name = parseName((await readBody(req)).name, "Routine name");
  try {
    const [row] = await query<{ id: number; name: string }>(
      `INSERT INTO routines (name, position)
       VALUES ($1, (SELECT coalesce(max(position), -1) + 1 FROM routines))
       RETURNING id, name`,
      [name],
    );
    return json({ ...row, workouts: [] } satisfies Routine, 201);
  } catch (error) {
    duplicateName(error, `You already have a routine called “${name}”`);
  }
}

export async function renameRoutine(id: number, req: Request) {
  const name = parseName((await readBody(req)).name, "Routine name");
  try {
    const rows = await sql()`UPDATE routines SET name = ${name} WHERE id = ${id} RETURNING id`;
    if (rows.length === 0) throw new HttpError(404, "Routine not found");
    return noContent();
  } catch (error) {
    duplicateName(error, `You already have a routine called “${name}”`);
  }
}

export async function deleteRoutine(id: number) {
  const rows = await sql()`DELETE FROM routines WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) throw new HttpError(404, "Routine not found");
  return noContent();
}

export async function createRoutineWorkout(routineId: number, req: Request) {
  const name = parseName((await readBody(req)).name, "Workout name");
  try {
    const [row] = await query<{ id: number }>(
      `INSERT INTO routine_workouts (routine_id, name, position)
       VALUES ($1, $2, (SELECT coalesce(max(position), -1) + 1 FROM routine_workouts WHERE routine_id = $1))
       RETURNING id`,
      [routineId, name],
    );
    return json(await loadRoutineWorkout(row.id), 201);
  } catch (error) {
    if (pgCode(error) === "23503") throw new HttpError(422, "Routine not found");
    duplicateName(error, `This routine already has a workout called “${name}”`);
  }
}

export async function getRoutineWorkout(id: number) {
  const workout = await loadRoutineWorkout(id);
  if (!workout) throw new HttpError(404, "Workout not found");
  return json(workout);
}

function parseExerciseList(value: unknown): RoutineExerciseInput[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw new HttpError(400, "Exercises must be a list of at most 50 items");
  }
  const seen = new Set<number>();
  const list: RoutineExerciseInput[] = [];
  for (const item of value) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const exerciseId = parseId(entry.exerciseId);
    if (seen.has(exerciseId)) continue; // each exercise once per workout
    seen.add(exerciseId);
    list.push({
      exerciseId,
      targetSets: parseTarget(entry.targetSets, 20, "Target sets"),
      targetReps: parseTarget(entry.targetReps, 1000, "Target reps"),
    });
  }
  return list;
}

/** Rename and/or replace the ordered exercise list. Body: { name?, exercises? }. */
export async function updateRoutineWorkout(id: number, req: Request) {
  const body = await readBody(req);
  const name = body.name === undefined ? undefined : parseName(body.name, "Workout name");
  const exercises = body.exercises === undefined ? undefined : parseExerciseList(body.exercises);

  if (!(await loadRoutineWorkout(id))) throw new HttpError(404, "Workout not found");

  if (name !== undefined) {
    try {
      await sql()`UPDATE routine_workouts SET name = ${name} WHERE id = ${id}`;
    } catch (error) {
      duplicateName(error, `This routine already has a workout called “${name}”`);
    }
  }

  if (exercises !== undefined) {
    const rows = exercises.map((e, position) => ({
      exercise_id: e.exerciseId,
      position,
      target_sets: e.targetSets,
      target_reps: e.targetReps,
    }));
    try {
      // One statement, so the list is replaced atomically.
      await query(
        `WITH removed AS (DELETE FROM routine_workout_exercises WHERE routine_workout_id = $1)
         INSERT INTO routine_workout_exercises (routine_workout_id, exercise_id, position, target_sets, target_reps)
         SELECT $1, x.exercise_id, x.position, x.target_sets, x.target_reps
           FROM jsonb_to_recordset($2::jsonb)
             AS x(exercise_id int, position int, target_sets int, target_reps int)`,
        [id, JSON.stringify(rows)],
      );
    } catch (error) {
      if (pgCode(error) === "23503") throw new HttpError(422, "One of those exercises no longer exists");
      throw error;
    }
  }

  return json(await loadRoutineWorkout(id));
}

export async function deleteRoutineWorkout(id: number) {
  const rows = await sql()`DELETE FROM routine_workouts WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) throw new HttpError(404, "Workout not found");
  return noContent();
}
