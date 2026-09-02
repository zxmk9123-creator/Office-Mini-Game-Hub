import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { GameNotFoundError, InvalidGameResultError } from "@mini-game-hub/game-core";
import { InvalidNicknameError, PlayerNotFoundError } from "./services/playerService";
import {
  GameDisabledError,
  InvalidSessionTransitionError,
  SessionNotFoundError,
} from "./services/gameSessionService";
import {
  DuplicateResultError,
  SessionGameMismatchError,
  SessionNotEligibleError,
} from "./services/gameResultService";
import { InvalidNoteError, NoteNotFoundError } from "./services/noteService";
import { InvalidStickyNoteError, StickyNoteNotFoundError } from "./services/stickyNoteService";

/**
 * Translates domain errors raised by services into HTTP responses. Route
 * handlers never construct status codes themselves — this is the one place
 * that mapping lives.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation_error", details: err.issues });
    return;
  }
  if (err instanceof InvalidNicknameError) {
    res.status(400).json({ error: "invalid_nickname", message: err.message });
    return;
  }
  if (err instanceof PlayerNotFoundError) {
    res.status(404).json({ error: "player_not_found", message: err.message });
    return;
  }
  if (err instanceof GameNotFoundError) {
    res.status(404).json({ error: "game_not_found", message: err.message });
    return;
  }
  if (err instanceof GameDisabledError) {
    res.status(409).json({ error: "game_disabled", message: err.message });
    return;
  }
  if (err instanceof SessionNotFoundError) {
    res.status(404).json({ error: "session_not_found", message: err.message });
    return;
  }
  if (err instanceof InvalidSessionTransitionError) {
    res.status(409).json({ error: "invalid_session_transition", message: err.message });
    return;
  }
  if (err instanceof SessionGameMismatchError) {
    res.status(404).json({ error: "session_not_found", message: err.message });
    return;
  }
  if (err instanceof SessionNotEligibleError) {
    res.status(409).json({ error: "session_not_eligible", message: err.message });
    return;
  }
  if (err instanceof DuplicateResultError) {
    res.status(409).json({ error: "duplicate_result", message: err.message });
    return;
  }
  if (err instanceof InvalidGameResultError) {
    res.status(422).json({ error: "invalid_result", message: err.message });
    return;
  }
  if (err instanceof NoteNotFoundError) {
    res.status(404).json({ error: "note_not_found", message: err.message });
    return;
  }
  if (err instanceof InvalidNoteError) {
    res.status(400).json({ error: "invalid_note", message: err.message });
    return;
  }
  if (err instanceof StickyNoteNotFoundError) {
    res.status(404).json({ error: "sticky_note_not_found", message: err.message });
    return;
  }
  if (err instanceof InvalidStickyNoteError) {
    res.status(400).json({ error: "invalid_sticky_note", message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "internal_error" });
};
