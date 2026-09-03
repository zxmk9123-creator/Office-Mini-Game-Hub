import { Router } from "express";
import { sql } from "drizzle-orm";
import type { Database } from "@mini-game-hub/database";

/**
 * TEMPORARY diagnostic route for the "yesterday's Swipe Brick Breaker
 * results still show in today's ranking" investigation. Read-only, no
 * secrets exposed (just result rows already visible to any player via the
 * ranking API, plus their storage-level ranking_date/created_at). Remove
 * this file and its mount in app.ts once the cause is confirmed and fixed.
 */
export function createDebugRouter(db: Database): Router {
  const router = Router();

  router.get("/debug/swipe-brick-breaker-results", async (_req, res, next) => {
    try {
      const rows = await db.execute(sql`
        SELECT r.id, r.score, r.ranking_date, r.created_at, s.status, s.completed_at, p.nickname
        FROM game_results r
        JOIN game_sessions s ON s.id = r.session_id
        JOIN players p ON p.id = r.player_id
        WHERE r.game_id = 'swipe-brick-breaker'
        ORDER BY r.created_at DESC
        LIMIT 20
      `);
      const serverNowUtc = new Date().toISOString();
      res.status(200).json({ serverNowUtc, rows });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
