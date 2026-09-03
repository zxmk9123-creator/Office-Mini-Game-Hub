import { pgTable, uuid, text, timestamp, doublePrecision, jsonb, boolean, index } from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nickname is deliberately NOT unique — Player ID is the identity.
  nickname: text("nickname").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * `id` is the same string slug used as GameMetadata.id in the game-core
 * GameRegistry (e.g. "reaction-test") — not a separate surrogate key. The
 * registry is the source of truth for which games exist; this table is
 * kept in sync with it at server startup so game_sessions can carry a real
 * foreign key without the application juggling two identities for the
 * same game.
 */
export const games = pgTable("games", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  scoreType: text("score_type", { enum: ["lower_is_better", "higher_is_better"] }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    status: text("status", { enum: ["started", "completed", "invalid", "abandoned"] })
      .notNull()
      .default("started"),
  },
  (table) => [
    index("game_sessions_player_id_idx").on(table.playerId),
    index("game_sessions_game_id_idx").on(table.gameId),
    index("game_sessions_status_idx").on(table.status),
    index("game_sessions_started_at_idx").on(table.startedAt),
  ],
);

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default(""),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const stickyNotes = pgTable(
  "sticky_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Anonymous browser/player-level ownership — the same Player identity
    // used for Reaction Test, not a real authenticated account. Nullable
    // because rows created before this column existed have no owner and
    // are deliberately left inaccessible (not deleted, not reassigned) —
    // see the sticky_notes migration for that backward-compat decision.
    playerId: uuid("player_id").references(() => players.id),
    content: text("content").notNull().default(""),
    color: text("color").notNull().default("yellow"),
    pinned: boolean("pinned").notNull().default(false),
    // Position/size lock — when true, dragging and resizing are disabled
    // client-side; content editing and pin/color/delete stay available.
    // Distinct from `pinned` (which only affects list ordering).
    locked: boolean("locked").notNull().default(false),
    // Freeform canvas position, in canvas/viewport pixels. Defaulted so
    // existing rows (added before the canvas layout existed) get a safe,
    // on-screen position via this same column default.
    x: doublePrecision("x").notNull().default(24),
    y: doublePrecision("y").notNull().default(24),
    // Freeform canvas size, in pixels. Defaulted so existing rows (added
    // before resizing existed) get a sensible on-screen size via this same
    // column default.
    width: doublePrecision("width").notNull().default(200),
    height: doublePrecision("height").notNull().default(160),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("sticky_notes_player_id_idx").on(table.playerId)],
);

export const gameResults = pgTable(
  "game_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // unique: a session represents exactly one attempt, so it may have at
    // most one result — enforced here, not just in application code, so a
    // race between two concurrent submissions can't create two rows.
    sessionId: uuid("session_id")
      .notNull()
      .unique()
      .references(() => gameSessions.id),
    playerId: uuid("player_id").notNull().references(() => players.id),
    gameId: text("game_id").notNull().references(() => games.id),
    // A generic score, not necessarily a whole number — e.g. Reaction Test's
    // score comes from performance.now() deltas, which are sub-millisecond
    // floats (376.09999999403954), not integers.
    score: doublePrecision("score"),
    metadata: jsonb("metadata").notNull().default({}),
    // Only set for games with GameMetadata.rankingPeriod === "daily" (e.g.
    // Swipe Brick Breaker) — the Asia/Seoul (KST, UTC+9) calendar date this
    // result belongs to, as "YYYY-MM-DD", computed server-side at insert
    // time regardless of server-local timezone (see apps/server's
    // kstDateString). null for every "allTime" game (the platform
    // default) — the ranking query only filters on this column when it is
    // non-null, so other games' rankings are completely unaffected. A new
    // KST day simply means new rows get a new value here; nothing is ever
    // deleted, and no scheduled job is required.
    rankingDate: text("ranking_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // The ranking query always filters by game_id first (WHERE game_id = $1
    // before reducing to best-per-player) — this is the one access pattern
    // that justifies an index here.
    index("game_results_game_id_idx").on(table.gameId),
    // Daily-ranking games (see rankingDate above) always filter by both
    // game_id and ranking_date together — this composite index serves that
    // exact access pattern without slowing down all-time games, which never
    // filter on ranking_date at all.
    index("game_results_game_id_ranking_date_idx").on(table.gameId, table.rankingDate),
  ],
);
