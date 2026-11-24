import { getDatabase, type DatabaseConnection } from "@netlify/database";

// Netlify Database picks the right driver and connection for wherever this runs:
// the local Postgres under `netlify dev`, a preview branch, or production.
// The schema lives in netlify/database/migrations and is applied by Netlify on deploy.

let connection: DatabaseConnection | null = null;

function database(): DatabaseConnection {
  connection ??= getDatabase();
  return connection;
}

/** Tagged-template query: `await sql()\`SELECT ... WHERE id = ${id}\`` resolves to the rows. */
export const sql = () => database().sql;

/** Plain-text query with $1, $2 … placeholders, for SQL assembled from trusted fragments. */
export function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return database().sql.unsafe(text, params as never[], { rowMode: "object" }) as Promise<T[]>;
}
