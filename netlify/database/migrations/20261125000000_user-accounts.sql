-- User accounts (email + password) with cookie sessions, and per-user ownership of all data.
--
-- Ownership lives on the top-level tables (exercises, workouts, routines); sets, routine workouts and
-- their exercise lists belong to a user through those. Rows created before accounts existed have
-- user_id NULL, are invisible to everyone, and are claimed by the first account that signs up.

CREATE TABLE users (
  id             serial PRIMARY KEY,
  email          text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- One row per signed-in device. The cookie holds a random token; only its SHA-256 is stored.
CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Failed sign-in attempts, for slowing down password guessing.
CREATE TABLE login_failures (
  id          serial PRIMARY KEY,
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_failures_email_idx ON login_failures (lower(email), created_at);

ALTER TABLE exercises ADD COLUMN user_id integer REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE workouts  ADD COLUMN user_id integer REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE routines  ADD COLUMN user_id integer REFERENCES users(id) ON DELETE CASCADE;

-- Names and days are now unique per user instead of globally.
DROP INDEX exercises_name_lower_key;
CREATE UNIQUE INDEX exercises_user_name_lower_key ON exercises (user_id, lower(name));

DROP INDEX routines_name_lower_key;
CREATE UNIQUE INDEX routines_user_name_lower_key ON routines (user_id, lower(name));

ALTER TABLE workouts DROP CONSTRAINT workouts_performed_on_key;
CREATE UNIQUE INDEX workouts_user_performed_on_key ON workouts (user_id, performed_on);
