import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export * from "./schema";

export interface CreateDbOptions {
  /** Passed straight through to the `postgres` client's `ssl` option (e.g. `{ rejectUnauthorized: false }` for a managed Postgres with a self-signed cert). Omit for a plain, unencrypted local connection. */
  ssl?: postgres.Options<Record<string, never>>["ssl"];
}

export function createDb(connectionString: string, options: CreateDbOptions = {}) {
  const client = postgres(connectionString, { ssl: options.ssl });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

/** The transaction object Database["transaction"]'s callback receives — same query-builder surface as Database. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything a repository can run queries against: a plain connection or an in-flight transaction. */
export type DbClient = Database | Transaction;
