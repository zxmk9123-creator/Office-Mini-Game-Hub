import { z } from "zod";

export const createNoteRequestSchema = z.object({
  title: z.string().default(""),
  content: z.string().default(""),
});

export const updateNoteRequestSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
});

export const noteIdParamsSchema = z.object({
  id: z.string().uuid(),
});
