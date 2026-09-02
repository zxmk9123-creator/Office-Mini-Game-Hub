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

export const stickyNotes = pgTable("sticky_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: text("content").notNull().default(""),
  color: text("color").notNull().default("yellow"),
  pinned: boolean("pinned").notNull().default(false),
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
});

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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // The ranking query always filters by game_id first (WHERE game_id = $1
    // before reducing to best-per-player) — this is the one access pattern
    // that justifies an index here.
    index("game_results_game_id_idx").on(table.gameId),
  ],
);
