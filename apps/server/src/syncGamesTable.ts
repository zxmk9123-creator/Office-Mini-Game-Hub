import { games, type Database } from "@mini-game-hub/database";
import type { GameRegistry } from "@mini-game-hub/game-core";

/**
 * Upserts every game the GameRegistry knows about into the `games` table so
 * game_sessions.game_id can carry a real foreign key. The registry (code)
 * is the source of truth; this keeps the database a reflection of it,
 * never the other way around.
 */
export async function syncGamesTable(db: Database, registry: GameRegistry): Promise<void> {
  for (const metadata of registry.list()) {
    await db
      .insert(games)
      .values({
        id: metadata.id,
        name: metadata.name,
        description: metadata.description,
        scoreType: metadata.scoreType,
        isActive: metadata.enabled,
      })
      .onConflictDoUpdate({
        target: games.id,
        set: {
          name: metadata.name,
          description: metadata.description,
          scoreType: metadata.scoreType,
          isActive: metadata.enabled,
        },
      });
  }
}
