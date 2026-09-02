import { z } from "zod";

export const rankingParamsSchema = z.object({
  gameId: z.string().min(1),
});

export const rankingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  playerId: z.string().uuid().optional(),
});
