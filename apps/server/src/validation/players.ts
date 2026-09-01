import { z } from "zod";

export const createPlayerRequestSchema = z.object({
  nickname: z.string(),
});

export const playerIdParamsSchema = z.object({
  id: z.string().uuid(),
});
