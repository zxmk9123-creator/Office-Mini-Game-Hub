import { Router } from "express";
import type { RankingService } from "../services/rankingService";
import { rankingParamsSchema, rankingQuerySchema } from "../validation/ranking";

export function createRankingRouter(rankingService: RankingService): Router {
  const router = Router();

  router.get("/games/:gameId/ranking", async (req, res, next) => {
    try {
      const params = rankingParamsSchema.parse(req.params);
      const query = rankingQuerySchema.parse(req.query);
      const result = await rankingService.getRanking({ gameId: params.gameId, ...query });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
