import { Router } from "express";
import type { GameSessionService } from "../services/gameSessionService";
import {
  createSessionParamsSchema,
  createSessionRequestSchema,
  sessionIdParamsSchema,
} from "../validation/sessions";

export function createSessionsRouter(sessionService: GameSessionService): Router {
  const router = Router();

  router.post("/games/:gameId/sessions", async (req, res, next) => {
    try {
      const params = createSessionParamsSchema.parse(req.params);
      const body = createSessionRequestSchema.parse(req.body);
      const session = await sessionService.createSession(body.playerId, params.gameId);
      res.status(201).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:id", async (req, res, next) => {
    try {
      const params = sessionIdParamsSchema.parse(req.params);
      const session = await sessionService.getSession(params.id);
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
