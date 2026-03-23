import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Use a single connection for migrations/seed scripts; pool for the API.
// In Next.js API routes, disable prefetch to avoid holding idle connections.
const client = postgres(process.env.DATABASE_URL, {
  prepare: false, // required for Supabase transaction pooler
});

export const db = drizzle(client, { schema });
export type Database = typeof db;
