/**
 * One-off data reset: deletes all existing Swipe Brick Breaker score/
 * ranking records (game_results rows for game_id = "swipe-brick-breaker")
 * so the leaderboard starts clean under the new Round-based scoring.
 *
 * Scoped strictly to game_id = "swipe-brick-breaker" — every other game's
 * results, and the ranking infrastructure itself (schema, indexes, the
 * ranking query), are untouched. Players/sessions rows are left alone too;
 * only the score/ranking records for this one game are removed.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx packages/database/scripts/reset-swipe-brick-breaker-scores.ts
 *
 * Defaults to a dry run (prints how many rows would be deleted). Pass
 * --confirm to actually delete them.
 */
import { sql } from "drizzle-orm";
import { createDb } from "../src/index";

const GAME_ID = "swipe-brick-breaker";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const confirm = process.argv.includes("--confirm");
  const needsSsl = !databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1");
  const db = createDb(databaseUrl, needsSsl ? { ssl: { rejectUnauthorized: false } } : {});

  const countRows = (await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM game_results WHERE game_id = ${GAME_ID}`,
  )) as unknown as { count: number }[];
  const count = countRows[0]?.count ?? 0;

  if (!confirm) {
    console.log(`Dry run: ${count} Swipe Brick Breaker game_results row(s) would be deleted. Re-run with --confirm to actually delete them.`);
    process.exit(0);
  }

  const deleted = (await db.execute(
    sql`DELETE FROM game_results WHERE game_id = ${GAME_ID} RETURNING id`,
  )) as unknown as { id: string }[];
  console.log(`Deleted ${deleted.length} Swipe Brick Breaker game_results row(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
