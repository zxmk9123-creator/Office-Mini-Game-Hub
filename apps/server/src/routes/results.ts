import { Router } from "express";
import type { GameResultService } from "../services/gameResultService";
import { submitResultParamsSchema, submitResultRequestSchema } from "../validation/results";

export function createResultsRouter(resultService: GameResultService): Router {
  const router = Router();

  router.post("/games/:gameId/results", async (req, res, next) => {
    try {
      const params = submitResultParamsSchema.parse(req.params);
      const body = submitResultRequestSchema.parse(req.body);
      const result = await resultService.submitResult(params.gameId, body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
