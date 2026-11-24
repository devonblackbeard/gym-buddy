-- Initial schema: exercises, one workout row per calendar day, and the sets logged in it.

CREATE TABLE exercises (
  id          serial PRIMARY KEY,
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX exercises_name_lower_key ON exercises (lower(name));

CREATE TABLE workouts (
  id            serial PRIMARY KEY,
  performed_on  date NOT NULL UNIQUE,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sets (
  id           serial PRIMARY KEY,
  workout_id   integer NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id  integer NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  reps         integer NOT NULL CHECK (reps >= 0),
  weight       numeric(7,2) NOT NULL CHECK (weight >= 0),
  unit         text NOT NULL DEFAULT 'lb' CHECK (unit IN ('lb', 'kg')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sets_workout_id_idx ON sets (workout_id);
CREATE INDEX sets_exercise_id_idx ON sets (exercise_id);
