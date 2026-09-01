import express, { type Express } from "express";
import cors from "cors";
import { getDb } from "./db";
import { getGameRegistry } from "./gameRegistry";
import { DrizzlePlayerRepository } from "./repositories/playerRepository";
import { DrizzleGameSessionRepository } from "./repositories/gameSessionRepository";
import { PlayerService } from "./services/playerService";
import { GameSessionService } from "./services/gameSessionService";
import { GameResultService } from "./services/gameResultService";
import { createPlayersRouter } from "./routes/players";
import { createSessionsRouter } from "./routes/sessions";
import { createResultsRouter } from "./routes/results";
import { errorHandler } from "./errorHandler";

/** Builds the Express app with all routes wired to real services/repositories. */
export function createApp(): Express {
  const db = getDb();
  const gameRegistry = getGameRegistry();

  const playerRepository = new DrizzlePlayerRepository(db);
  const sessionRepository = new DrizzleGameSessionRepository(db);
  const playerService = new PlayerService(playerRepository);
  const sessionService = new GameSessionService(sessionRepository, playerRepository, gameRegistry);
  const resultService = new GameResultService(db, gameRegistry);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api", createPlayersRouter(playerService));
  app.use("/api", createSessionsRouter(sessionService));
  app.use("/api", createResultsRouter(resultService));

  app.use(errorHandler);

  return app;
}
