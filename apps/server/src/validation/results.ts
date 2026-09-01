import { z } from "zod";

export const submitResultParamsSchema = z.object({
  gameId: z.string().min(1),
});

export const submitResultRequestSchema = z.object({
  sessionId: z.string().uuid(),
  // A real NaN/Infinity can't survive JSON transport (JSON.stringify turns
  // both into `null`), so z.number() here is purely a request-shape check;
  // GameResultService/validateGameResult is what actually enforces
  // finiteness once a value has made it into a JS number.
  score: z.number().nullable(),
  completion: z.object({
    reason: z.enum(["completed", "invalid", "aborted"]),
    completedAt: z.number(),
  }),
  // A plain, arbitrary-shape object — the structural contract for
  // per-game metadata. Its actual fields are never inspected here.
  metadata: z.record(z.unknown()).default({}),
});
