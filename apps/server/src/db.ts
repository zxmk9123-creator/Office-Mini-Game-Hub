import { createDb, type Database } from "@mini-game-hub/database";

let db: Database | undefined;

/** Lazily creates and caches the single Database connection for this process. */
export function getDb(): Database {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing required environment variable: DATABASE_URL");
    }
    db = createDb(connectionString);
  }
  return db;
}
