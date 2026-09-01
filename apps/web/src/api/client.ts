import type { GameCompletionReason } from "@mini-game-hub/game-core";

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
  const res = await fetch(`/api${path}`, {
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
