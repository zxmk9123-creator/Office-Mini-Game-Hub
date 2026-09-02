import { Router } from "express";
import type { StickyNoteService } from "../services/stickyNoteService";
import {
  createStickyNoteRequestSchema,
  stickyNoteIdParamsSchema,
  stickyNotePlayerIdQuerySchema,
  updateStickyNoteRequestSchema,
} from "../validation/stickyNotes";

/**
 * Route handlers only parse/validate the HTTP boundary and translate
 * StickyNoteService results to responses — no persistence logic here.
 *
 * `playerId` is required on every one of these routes — it's the same
 * anonymous, browser-local Player identity used elsewhere (Reaction
 * Test), giving each browser/player its own private Sticky Note
 * collection. It is NOT an authentication mechanism: there is no login
 * in this app, so a client that already knows another player's id could
 * still pass it here. List/create take it in the body or query exactly
 * like the existing GameSession routes already do with playerId.
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

  router.get("/sticky-notes", async (req, res, next) => {
    try {
      const query = stickyNotePlayerIdQuerySchema.parse(req.query);
      const stickyNotes = await stickyNoteService.listStickyNotes(query.playerId);
      res.status(200).json(stickyNotes);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/sticky-notes/:id", async (req, res, next) => {
    try {
      const params = stickyNoteIdParamsSchema.parse(req.params);
      const { playerId, ...patch } = updateStickyNoteRequestSchema.parse(req.body);
      const stickyNote = await stickyNoteService.updateStickyNote(params.id, playerId, patch);
      res.status(200).json(stickyNote);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/sticky-notes/:id", async (req, res, next) => {
    try {
      const params = stickyNoteIdParamsSchema.parse(req.params);
      const query = stickyNotePlayerIdQuerySchema.parse(req.query);
      await stickyNoteService.deleteStickyNote(params.id, query.playerId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
