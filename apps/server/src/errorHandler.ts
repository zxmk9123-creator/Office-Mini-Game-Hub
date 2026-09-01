import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { GameNotFoundError } from "@mini-game-hub/game-core";
import { InvalidNicknameError, PlayerNotFoundError } from "./services/playerService";
import {
  GameDisabledError,
  InvalidSessionTransitionError,
  SessionNotFoundError,
} from "./services/gameSessionService";

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

  console.error(err);
  res.status(500).json({ error: "internal_error" });
};
