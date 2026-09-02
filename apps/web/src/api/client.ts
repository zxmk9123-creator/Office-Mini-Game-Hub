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
  if (res.status === 204) {
    if (!res.ok) {
      throw new ApiError(res.status, undefined);
    }
    return undefined as T;
  }
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

export interface RankingEntryDto {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  metadata: unknown;
  completedAt: string;
}

export interface RankingDto {
  game: { id: string; name: string; scoreType: "lower_is_better" | "higher_is_better" };
  entries: RankingEntryDto[];
  pagination: { limit: number; offset: number; total: number };
  playerRank?: RankingEntryDto | null;
}

export interface NoteDto {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export function listNotes(): Promise<NoteDto[]> {
  return request<NoteDto[]>("/notes");
}

export function createNote(input: { title: string; content: string }): Promise<NoteDto> {
  return request<NoteDto>("/notes", { method: "POST", body: JSON.stringify(input) });
}

export function updateNote(id: string, input: { title?: string; content?: string }): Promise<NoteDto> {
  return request<NoteDto>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteNote(id: string): Promise<void> {
  return request<void>(`/notes/${id}`, { method: "DELETE" });
}

export type StickyNoteColor = "yellow" | "pink" | "blue" | "green" | "purple";

export interface StickyNoteDto {
  id: string;
  content: string;
  color: StickyNoteColor;
  pinned: boolean;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
}

export function listStickyNotes(): Promise<StickyNoteDto[]> {
  return request<StickyNoteDto[]>("/sticky-notes");
}

export function createStickyNote(input: {
  content?: string;
  color?: StickyNoteColor;
  x?: number;
  y?: number;
}): Promise<StickyNoteDto> {
  return request<StickyNoteDto>("/sticky-notes", { method: "POST", body: JSON.stringify(input) });
}

export function updateStickyNote(
  id: string,
  input: { content?: string; color?: StickyNoteColor; pinned?: boolean; x?: number; y?: number },
): Promise<StickyNoteDto> {
  return request<StickyNoteDto>(`/sticky-notes/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteStickyNote(id: string): Promise<void> {
  return request<void>(`/sticky-notes/${id}`, { method: "DELETE" });
}

export function getRanking(
  gameId: string,
  options?: { limit?: number; offset?: number; playerId?: string },
): Promise<RankingDto> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  if (options?.offset !== undefined) params.set("offset", String(options.offset));
  if (options?.playerId) params.set("playerId", options.playerId);
  const qs = params.toString();
  return request<RankingDto>(`/games/${gameId}/ranking${qs ? `?${qs}` : ""}`);
}
