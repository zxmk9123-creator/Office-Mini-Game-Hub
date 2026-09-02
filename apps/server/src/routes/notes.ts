import { Router } from "express";
import type { NoteService } from "../services/noteService";
import { createNoteRequestSchema, noteIdParamsSchema, updateNoteRequestSchema } from "../validation/notes";

/**
 * Route handlers only parse/validate the HTTP boundary and translate
 * NoteService results to responses — no persistence logic here.
 */
export function createNotesRouter(noteService: NoteService): Router {
  const router = Router();

  router.post("/notes", async (req, res, next) => {
    try {
      const body = createNoteRequestSchema.parse(req.body);
      const note = await noteService.createNote(body);
      res.status(201).json(note);
    } catch (error) {
      next(error);
    }
  });

  router.get("/notes", async (_req, res, next) => {
    try {
      const notes = await noteService.listNotes();
      res.status(200).json(notes);
    } catch (error) {
      next(error);
    }
  });

  router.get("/notes/:id", async (req, res, next) => {
    try {
      const params = noteIdParamsSchema.parse(req.params);
      const note = await noteService.getNote(params.id);
      res.status(200).json(note);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/notes/:id", async (req, res, next) => {
    try {
      const params = noteIdParamsSchema.parse(req.params);
      const body = updateNoteRequestSchema.parse(req.body);
      const note = await noteService.updateNote(params.id, body);
      res.status(200).json(note);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/notes/:id", async (req, res, next) => {
    try {
      const params = noteIdParamsSchema.parse(req.params);
      await noteService.deleteNote(params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
