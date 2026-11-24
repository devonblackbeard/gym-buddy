import { neon } from "@netlify/neon";

type Sql = ReturnType<typeof neon>;

let client: Sql | null = null;

/** Lazily created so a missing NETLIFY_DATABASE_URL surfaces as a request error, not a crash on import. */
export function db(): Sql {
  client ??= neon();
  return client;
}

// Idempotent schema. Runs once per function instance (cold start) in a single round trip,
// so there is no separate migration step to remember before the first deploy.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS exercises (
     id          serial PRIMARY KEY,
     name        text NOT NULL CHECK (length(trim(name)) > 0),
     created_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS exercises_name_lower_key ON exercises (lower(name))`,
  `CREATE TABLE IF NOT EXISTS workouts (
     id            serial PRIMARY KEY,
     performed_on  date NOT NULL UNIQUE,
     notes         text,
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS sets (
     id           serial PRIMARY KEY,
     workout_id   integer NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
     exercise_id  integer NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
     reps         integer NOT NULL CHECK (reps >= 0),
     weight       numeric(7,2) NOT NULL CHECK (weight >= 0),
     unit         text NOT NULL DEFAULT 'lb' CHECK (unit IN ('lb', 'kg')),
     created_at   timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS sets_workout_id_idx ON sets (workout_id)`,
  `CREATE INDEX IF NOT EXISTS sets_exercise_id_idx ON sets (exercise_id)`,
  // Daily step totals pushed from Apple Health by an iOS Shortcut (POST /api/steps).
  `CREATE TABLE IF NOT EXISTS daily_steps (
     day         date PRIMARY KEY,
     steps       integer NOT NULL CHECK (steps >= 0),
     updated_at  timestamptz NOT NULL DEFAULT now()
   )`,
];

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const sql = db();
    await sql.transaction(SCHEMA.map((statement) => sql.query(statement)));
  })().catch((error) => {
    schemaReady = null; // retry on the next request
    throw error;
  });
  return schemaReady;
}
