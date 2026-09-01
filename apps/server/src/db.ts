import { createDb, type Database } from "@mini-game-hub/database";

const LOCAL_HOST_PATTERN = /(^|@)(localhost|127\.0\.0\.1)(:|\/)/;

/**
 * Managed Postgres (Render included) is reached over TLS and typically
 * presents a certificate we can't chain-verify from a generic client, so
 * `rejectUnauthorized: false` is the standard way to still get an
 * encrypted connection without failing on that. A local database has
 * neither concern. `DATABASE_SSL=true|false` overrides the auto-detection
 * for the rare case a non-local database genuinely doesn't use SSL, or a
 * local one does.
 */
function resolveSsl(connectionString: string): boolean | { rejectUnauthorized: false } {
  const override = process.env.DATABASE_SSL;
  if (override === "true") {
    return { rejectUnauthorized: false };
  }
  if (override === "false") {
    return false;
  }
  return LOCAL_HOST_PATTERN.test(connectionString) ? false : { rejectUnauthorized: false };
}

let db: Database | undefined;

/** Lazily creates and caches the single Database connection for this process. */
export function getDb(): Database {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing required environment variable: DATABASE_URL");
    }
    db = createDb(connectionString, { ssl: resolveSsl(connectionString) });
  }
  return db;
}

/** Closes the underlying connection pool — call during graceful shutdown. */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.$client.end();
    db = undefined;
  }
}
