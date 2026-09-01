import type { GameCompletionReason } from "@mini-game-hub/game-core";

/**
 * Base URL the API lives at, with no trailing slash. Empty by default —
 * requests go to a same-origin relative "/api/..." path, which the Vite
 * dev server proxies to the local API (see vite.config.ts) and which also
 * works if the API is ever served from the same origin as the web app in
 * production. When the API is deployed at a separate origin (e.g. a
 * standalone Render web service), set VITE_API_BASE_URL to that origin at
 * build time — nothing else in this file changes.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

export interface Player {
  id: string;
  nickname: string;
  createdAt: string;
  updatedAt: string;
}

export function createPlayer(nickname: string): Promise<Player> {
  return request<Player>("/players", { method: "POST", body: JSON.stringify({ nickname }) });
}

export interface GameSessionDto {
  id: string;
  playerId: string;
  gameId: string;
  startedAt: string;
  completedAt: string | null;
  status: "started" | "completed" | "invalid" | "abandoned";
}

export function createGameSession(gameId: string, playerId: string): Promise<GameSessionDto> {
  return request<GameSessionDto>(`/games/${gameId}/sessions`, {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
}

export interface SubmitResultPayload {
  sessionId: string;
  score: number | null;
  completion: { reason: GameCompletionReason; completedAt: number };
  metadata: unknown;
}

export interface GameResultDto {
  id: string;
  sessionId: string;
  playerId: string;
  gameId: string;
  score: number | null;
  metadata: unknown;
  createdAt: string;
}

export function submitGameResult(gameId: string, payload: SubmitResultPayload): Promise<GameResultDto> {
  return request<GameResultDto>(`/games/${gameId}/results`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
