import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Database client setup
// In production, you would use process.env.DATABASE_URL
// For now, we'll export a function that creates the client when needed
export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema });
}

// Lazy initialization - only create db when needed
let _db: ReturnType<typeof getDb> | null = null;

export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(target, prop) {
    if (!_db) {
      _db = getDb();
    }
    return (_db as any)[prop];
  },
});

export { schema };
