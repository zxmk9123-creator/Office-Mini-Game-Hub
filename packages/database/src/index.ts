import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export * from "./schema";

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

/** The transaction object Database["transaction"]'s callback receives — same query-builder surface as Database. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything a repository can run queries against: a plain connection or an in-flight transaction. */
export type DbClient = Database | Transaction;
