# 메모장 (Office Mini Game Hub)

가벼운 데스크톱형 메모 유틸리티. 메모와 스티커 메모가 애플리케이션의 기본 화면이고, 업무 중 짧게 즐길 수 있는
미니게임(Reaction Test 등)은 "도구" 메뉴 아래에 딸린 부가 기능으로 제공된다. 저장소/기술 식별자
(`mini-game-hub`, `reaction-test` 등)는 그대로 유지하고, 사용자에게 보이는 제품명만 "메모장"으로 표시한다.

## Status

**Phase 9 — Notebook + Sticky Notes Foundation** 완료. https://mini-game-hub-web.onrender.com 에 실제 배포되어 있다.

- Phase 1: 모노레포 뼈대, 빌드 도구 체인, DB 스키마 초안
- Phase 2: 프레임워크에 종속되지 않는 Game Core (Game 계약, 플랫폼 라이프사이클, GameRegistry, Mock Game)
- Phase 3: Reaction Test 게임 엔진 + React 프레젠테이션
- Phase 4: Player / GameSession 도메인, REST API, GameRegistry와 연동된 세션 생성
- Phase 5: GameResult 영속화(GameResultService), 세션↔결과 무결성(중복 제출 방지), 트랜잭션 원자성, Reaction Test ↔ 결과 API 연동
- Phase 6: Render 배포 — `render.yaml`, 관리형 Postgres용 SSL 처리, `0.0.0.0` 바인딩, graceful shutdown,
  부팅 시 자동 마이그레이션, 환경변수 기반 CORS/`VITE_API_BASE_URL`
- Phase 7: 게임 공통 랭킹 시스템 — `RankingService`, best-score/동점 처리, 페이지네이션, 리더보드 UI
- Phase 8: 닉네임 입력 화면(`usePlayerSession` — 자동 Guest 생성 없이, 명시적 제출 시에만 Player 생성),
  Top 5 → Top 10 리더보드, 게임 선택(Home) 화면, HOME → NICKNAME → PLAYING → RESULT 상태 전환, 오피스 미니
  게임에 어울리는 절제된 UI/UX. 프론트엔드 테스트 24개 추가(vitest + @testing-library/react)
- Phase 9: 제품 정체성을 "메모장"으로 재브랜딩(브라우저 타이틀/헤더/빈 상태 등 사용자 노출 영역만; 저장소·API·
  게임 레지스트리 식별자는 그대로 유지) — 메모(`notes`)와 스티커 메모(`sticky_notes`) 기능을 라우트→서비스→
  리포지토리→DB(마이그레이션 0004)의 기존 아키텍처로 신규 구현, PostgreSQL에 영속화되어 새로고침에도 유지됨.
  상단 탭 내비게이션(메모 / 스티커 메모 / 도구)으로 구성된 노트북 셸이 기본 화면이 되었고, Reaction Test는
  "도구" 아래의 부가 기능으로 이동(닉네임 입력은 Reaction Test 진입 시에만 요구). 작은 창 크기(≈600×500)까지
  사용 가능한 반응형 레이아웃. 프론트엔드 테스트 17개, 백엔드 테스트 22개 추가
- Phase 9 후속: 스티커 메모를 카드/그리드 목록에서 자유 배치 캔버스로 전환. `sticky_notes`에 `x`/`y` 좌표
  컬럼 추가(마이그레이션 0005, 기존 행은 안전한 기본값으로 백필), Pointer Events 기반 드래그(포인터 캡처 사용,
  텍스트/버튼 위에서는 드래그가 시작되지 않음), 드래그 중에는 API 호출 없이 로컬 상태만 갱신하고 포인터를 뗄 때
  최종 좌표만 저장. 스티커는 항상 뷰포트 안에 최소한 일부가 보이도록 클램프되며, 겹침은 허용하지만 충돌
  회피는 구현하지 않음. 포커스/드래그된 스티커는 클라이언트 로컬 z-순서로 맨 앞에 표시(영속화하지 않음).
  새 스티커는 대각선 캐스케이드 오프셋으로 배치되어 겹치지 않음. 중앙 노트북 패널은 그대로 유지되고 스티커는
  `document.body`에 포털로 렌더링되어 패널 주위를 자유롭게 떠다님

인증, 안티치트는 아직 구현하지 않았다.

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
dashboard). Schema migrations run automatically as the first step of the API's own start command
(`npm run start` → `drizzle-kit migrate` → server boot), so a schema change just needs a normal
deploy — no separate manual migration step.

## API

```text
POST /api/players                 { nickname } -> 201 Player
GET  /api/players/:id             -> 200 Player | 404
POST /api/games/:gameId/sessions  { playerId } -> 201 GameSession | 404 (player/game) | 409 (disabled game)
GET  /api/sessions/:id            -> 200 GameSession | 404
POST /api/games/:gameId/results   { sessionId, score, completion, metadata }
                                   -> 201 GameResult | 404 (session/game) | 409 (terminal/duplicate) | 422 (invalid result)
GET  /api/games/:gameId/ranking   ?limit=20&offset=0&playerId=...
                                   -> 200 { game, entries, pagination, playerRank? } | 404 (game) | 409 (disabled game) | 400 (bad limit/offset)
GET  /api/health                  -> 200 { status: "ok" }

POST   /api/notes                 { title?, content? } -> 201 Note
GET    /api/notes                 -> 200 Note[] (most recently updated first)
GET    /api/notes/:id             -> 200 Note | 404
PATCH  /api/notes/:id             { title?, content? } -> 200 Note | 404
DELETE /api/notes/:id             -> 204 | 404

POST   /api/sticky-notes          { content?, color?, x?, y? } -> 201 StickyNote
GET    /api/sticky-notes          -> 200 StickyNote[] (pinned first, then most recently updated)
PATCH  /api/sticky-notes/:id      { content?, color?, pinned?, x?, y? } -> 200 StickyNote | 404 | 400 (bad color/x/y)
DELETE /api/sticky-notes/:id      -> 204 | 404
```

Notes and sticky notes are not tied to a Player — they are process-wide 메모장 content, not per-game player
data (Player/nickname remain scoped to the game/ranking pipeline). Sticky note `color` is restricted to a
fixed palette (`yellow`, `pink`, `blue`, `green`, `purple`); any other value is a `400`. `x`/`y` are the sticky
note's freeform canvas position in pixels; both must be finite numbers (rejects `NaN`/`Infinity`) or the
request is a `400`. Position updates are sent once, when a drag ends — never on every pointer-move.

## Ranking

Generic — `RankingService` never branches on a game id, only on `GameMetadata.scoreType`. Adding a
future game requires no ranking code changes, only registering it (see `gameRegistry.ts`).

- **Score direction**: `lower_is_better` sorts ascending (e.g. Reaction Test, ms); `higher_is_better`
  sorts descending.
- **Best score only**: a player may have many completed attempts; the leaderboard keeps their single
  best (`MIN`/`MAX` per `scoreType`) — a player appears at most once. Computed in Postgres (window
  function + `DISTINCT ON`), never by loading every result into Node.
- **Eligibility**: only results from `game_sessions.status = 'completed'` with a non-null score count.
  Invalid (false-start) results, abandoned sessions, and null scores are excluded — derived from the
  persisted relational data, not trusted from the request.
- **Ties**: standard competition ranking (`1, 2, 2, 4`, not `1, 2, 2, 3`). Equal scores are then
  ordered deterministically by `completedAt` (earlier first), then by result id.
- **Pagination**: `limit` 1–100 (default 20), `offset` ≥ 0 (default 0); response includes `total`.
- **Personal rank**: pass `?playerId=<uuid>` to also get that player's own best/rank in the response
  (`playerRank`), independent of the current page — a display convenience, not an auth mechanism
  (there is no login).

## Stack

React · TypeScript · Vite · Tailwind CSS · Node.js · Express · PostgreSQL · Drizzle ORM · Zod
