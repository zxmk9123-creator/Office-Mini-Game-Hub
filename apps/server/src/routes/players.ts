import { Router } from "express";
import type { PlayerService } from "../services/playerService";
import { createPlayerRequestSchema, playerIdParamsSchema } from "../validation/players";

/**
 * Route handlers only parse/validate the HTTP boundary and translate
 * PlayerService results to responses — no query building, no SQL.
 */
export function createPlayersRouter(playerService: PlayerService): Router {
  const router = Router();

  router.post("/players", async (req, res, next) => {
    try {
      const body = createPlayerRequestSchema.parse(req.body);
      const player = await playerService.createPlayer(body.nickname);
      res.status(201).json(player);
    } catch (error) {
      next(error);
    }
  });

  router.get("/players/:id", async (req, res, next) => {
    try {
      const params = playerIdParamsSchema.parse(req.params);
      const player = await playerService.getPlayer(params.id);
      res.status(200).json(player);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
