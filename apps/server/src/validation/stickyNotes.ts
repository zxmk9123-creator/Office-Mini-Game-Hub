import { z } from "zod";

export const createStickyNoteRequestSchema = z.object({
  content: z.string().default(""),
  color: z.string().optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
});

export const updateStickyNoteRequestSchema = z.object({
  content: z.string().optional(),
  color: z.string().optional(),
  pinned: z.boolean().optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
});

export const stickyNoteIdParamsSchema = z.object({
  id: z.string().uuid(),
});
