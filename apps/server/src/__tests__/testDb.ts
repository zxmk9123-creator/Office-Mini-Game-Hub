import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { getGameRegistry } from "../gameRegistry";
import { syncGamesTable } from "../syncGamesTable";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/mini_game_hub";

/** Ensures the `games` table reflects the registry once per test file. */
export async function ensureGamesSynced(): Promise<void> {
  await syncGamesTable(getDb(), getGameRegistry());
}

/** Clears player/session/result rows between tests without touching `games` (registry-owned reference data). */
export async function resetTestData(): Promise<void> {
  const db = getDb();
  await db.execute(sql`TRUNCATE TABLE game_results, game_sessions, players RESTART IDENTITY CASCADE`);
}
