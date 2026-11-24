-- Routines (e.g. Push, Pull, Legs), each holding named workouts (e.g. Push > Alpha, Push > Beta).
-- A routine workout is an ordered list of exercises with optional targets.
-- A logged day (workouts) can record which routine workout was done.

CREATE TABLE routines (
  id          serial PRIMARY KEY,
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX routines_name_lower_key ON routines (lower(name));

CREATE TABLE routine_workouts (
  id          serial PRIMARY KEY,
  routine_id  integer NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX routine_workouts_name_lower_key ON routine_workouts (routine_id, lower(name));

CREATE TABLE routine_workout_exercises (
  id                  serial PRIMARY KEY,
  routine_workout_id  integer NOT NULL REFERENCES routine_workouts(id) ON DELETE CASCADE,
  exercise_id         integer NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position            integer NOT NULL,
  target_sets         integer CHECK (target_sets BETWEEN 1 AND 20),
  target_reps         integer CHECK (target_reps BETWEEN 1 AND 1000)
);

CREATE INDEX routine_workout_exercises_workout_idx ON routine_workout_exercises (routine_workout_id, position);
CREATE INDEX routine_workout_exercises_exercise_idx ON routine_workout_exercises (exercise_id);

-- Which routine workout a logged day followed. Kept as NULL (history stays) if the routine workout is deleted.
ALTER TABLE workouts
  ADD COLUMN routine_workout_id integer REFERENCES routine_workouts(id) ON DELETE SET NULL;

CREATE INDEX workouts_routine_workout_idx ON workouts (routine_workout_id);
