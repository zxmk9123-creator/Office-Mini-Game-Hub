import { z } from "zod";

export const createSessionParamsSchema = z.object({
  gameId: z.string().min(1),
});

export const createSessionRequestSchema = z.object({
  playerId: z.string().uuid(),
});

export const sessionIdParamsSchema = z.object({
  id: z.string().uuid(),
});
