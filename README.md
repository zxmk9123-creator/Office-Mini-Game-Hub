# Office Mini Game Hub

업무 중 짧은 시간에 부담 없이 즐길 수 있는 초경량 미니게임 플랫폼. 닉네임 기반 플레이·기록·랭킹을 제공하고,
새로운 게임을 독립적으로 추가할 수 있는 구조를 지향한다.

## Status

**Phase 6 — Render 배포 준비** 완료 (코드/설정까지; 실제 Render 프로비저닝은 계정 소유자가 진행).

- Phase 1: 모노레포 뼈대, 빌드 도구 체인, DB 스키마 초안
- Phase 2: 프레임워크에 종속되지 않는 Game Core (Game 계약, 플랫폼 라이프사이클, GameRegistry, Mock Game)
- Phase 3: Reaction Test 게임 엔진 + React 프레젠테이션
- Phase 4: Player / GameSession 도메인, REST API, GameRegistry와 연동된 세션 생성
- Phase 5: GameResult 영속화(GameResultService), 세션↔결과 무결성(중복 제출 방지), 트랜잭션 원자성, Reaction Test ↔ 결과 API 연동
- Phase 6: Render 배포용 설정 — `render.yaml`, 관리형 Postgres용 SSL 처리, `0.0.0.0` 바인딩, graceful shutdown,
  환경변수 기반 CORS/`VITE_API_BASE_URL` (Phase 5에서 이미 구현)

랭킹, 인증, 리더보드 UI, 안티치트는 아직 구현하지 않았다. **실제 Render 서비스 생성·배포·프로덕션 E2E 검증은
이 세션에 Render 계정 접근 권한이 없어 수행하지 못했다** — 아래 "Render deployment"의 순서대로 계정 소유자가 직접
진행해야 한다.

## Structure

```text
mini-game-hub/
├── apps/
│   ├── web/      React + TypeScript + Vite + Tailwind CSS
│   └── server/   Node.js + Express + TypeScript
│       └── src/
│           ├── routes/        HTTP boundary (Zod validation)
│           ├── services/      PlayerService, GameSessionService
│           ├── repositories/  Drizzle-backed Player/GameSession persistence
│           ├── gameRegistry.ts  application-level GameRegistry wiring
│           └── syncGamesTable.ts  registry -> `games` table sync
├── packages/
│   ├── database/  Drizzle ORM schema (players, games, game_sessions, game_results) + migrations
│   ├── shared/    공통 타입 (Zod, scoreType 등)
│   └── game-core/ Game Interface / Registry / Reaction Test 엔진
```

## Getting started

```bash
npm install

# server (needs a running Postgres; see .env.example)
cp .env.example .env
npm run --workspace=packages/database generate   # only after changing schema.ts
npm run --workspace=packages/database migrate     # apply migrations to DATABASE_URL
npm run dev:server

# web (see apps/web/.env.example — VITE_API_BASE_URL)
cp apps/web/.env.example apps/web/.env
npm run dev:web
```

## Environment variables

```text
server (.env, or real env vars in production):
  DATABASE_URL   postgres connection string (required)
  PORT           port to bind; Render sets this automatically. Defaults to 4000 locally.
  CORS_ORIGIN    comma-separated allowed origins; defaults to http://localhost:5173
  DATABASE_SSL   "true" | "false" to force SSL on/off; auto-detected from DATABASE_URL
                 otherwise (off for localhost/127.0.0.1, on — with rejectUnauthorized:
                 false, standard for managed Postgres' self-signed certs — otherwise)

web (apps/web/.env, baked in at BUILD time — changing it requires a rebuild):
  VITE_API_BASE_URL   API origin, no trailing slash; empty = same-origin "/api/..."
```

## Render deployment

`render.yaml` at the repo root provisions all three services (`render apply`, or "New Blueprint
Instance" in the Render dashboard pointed at this repo). It's a starting point — validate field
names against Render's current Blueprint spec if the dashboard rejects anything.

Two env vars are deliberately left blank (`sync: false`) in `render.yaml` because their real values
don't exist until the *other* service has a live URL — a chicken-and-egg the deploy order below
resolves:

1. **Render PostgreSQL** — create first (`mini-game-hub-db` in the blueprint, or manually).
2. **Render API** (web service, Node runtime) — build command
   `npm install && npm run build --workspace=apps/server`, start command
   `npm run start --workspace=apps/server`, health check path `/api/health`.
   Set `DATABASE_URL` from the Postgres instance (`fromDatabase` in the blueprint does this
   automatically) and `DATABASE_SSL=true`. Leave `CORS_ORIGIN` unset for now.
3. **Apply migrations** against the Render Postgres — from a machine that can reach its external
   connection string:
   `DATABASE_URL=<render-postgres-external-url> npm run --workspace=packages/database migrate`
   (Safe to re-run — drizzle-kit tracks applied migrations.) The server's own `syncGamesTable` step
   then upserts `reaction-test` into `games` on every boot, so no manual seeding is needed beyond
   the schema migration itself.
4. Once the API service is live, note its URL (`https://mini-game-hub-api.onrender.com`-style) and
   verify `GET /api/health` returns `200` on it directly.
5. **Render Web** (static site) — build command `npm install && npm run build --workspace=apps/web`,
   publish path `apps/web/dist`, with a SPA rewrite (`/* -> /index.html`, already in `render.yaml`).
   Set `VITE_API_BASE_URL` to the API URL from step 4, then deploy — this is a *build-time* value,
   so changing it later requires a rebuild, not just a restart.
6. Go back to the API service and set `CORS_ORIGIN` to the web service's URL from this step, then
   redeploy the API so the new value takes effect.
7. Verify through the public web URL: create a player, play Reaction Test, confirm the result
   persists and a duplicate submission is rejected (`409`).

### Redeployment

Render redeploys automatically on push to the connected branch (or trigger manually from the
dashboard). A schema change needs its migration applied to the Render database the same way as
step 3 above — migrations are not run automatically on deploy in this setup.

## API

```text
POST /api/players                 { nickname } -> 201 Player
GET  /api/players/:id             -> 200 Player | 404
POST /api/games/:gameId/sessions  { playerId } -> 201 GameSession | 404 (player/game) | 409 (disabled game)
GET  /api/sessions/:id            -> 200 GameSession | 404
POST /api/games/:gameId/results   { sessionId, score, completion, metadata }
                                   -> 201 GameResult | 404 (session/game) | 409 (terminal/duplicate) | 422 (invalid result)
GET  /api/health                  -> 200 { status: "ok" }
```

## Stack

React · TypeScript · Vite · Tailwind CSS · Node.js · Express · PostgreSQL · Drizzle ORM · Zod
