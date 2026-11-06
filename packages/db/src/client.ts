import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/apoteku";

// Singleton query client for server runtimes (Bun / Node)
export const queryClient = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
});

export const db = drizzle(queryClient, { schema });

export function createDbClient(customUrl?: string) {
  const client = postgres(customUrl || connectionString);
  return drizzle(client, { schema });
}

export type AppDatabase = typeof db;
export { schema };
