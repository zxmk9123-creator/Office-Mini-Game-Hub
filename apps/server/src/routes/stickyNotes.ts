import { Router } from "express";
import type { StickyNoteService } from "../services/stickyNoteService";
import {
  createStickyNoteRequestSchema,
  stickyNoteIdParamsSchema,
  updateStickyNoteRequestSchema,
} from "../validation/stickyNotes";

/**
 * Route handlers only parse/validate the HTTP boundary and translate
 * StickyNoteService results to responses — no persistence logic here.
 */
export function createStickyNotesRouter(stickyNoteService: StickyNoteService): Router {
  const router = Router();

  router.post("/sticky-notes", async (req, res, next) => {
    try {
      const body = createStickyNoteRequestSchema.parse(req.body);
      const stickyNote = await stickyNoteService.createStickyNote(body);
      res.status(201).json(stickyNote);
    } catch (error) {
      next(error);
    }
  });

  router.get("/sticky-notes", async (_req, res, next) => {
    try {
      const stickyNotes = await stickyNoteService.listStickyNotes();
      res.status(200).json(stickyNotes);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/sticky-notes/:id", async (req, res, next) => {
    try {
      const params = stickyNoteIdParamsSchema.parse(req.params);
      const body = updateStickyNoteRequestSchema.parse(req.body);
      const stickyNote = await stickyNoteService.updateStickyNote(params.id, body);
      res.status(200).json(stickyNote);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/sticky-notes/:id", async (req, res, next) => {
    try {
      const params = stickyNoteIdParamsSchema.parse(req.params);
      await stickyNoteService.deleteStickyNote(params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
