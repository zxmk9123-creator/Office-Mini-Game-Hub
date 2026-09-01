# Office Mini Game Hub

업무 중 짧은 시간에 부담 없이 즐길 수 있는 초경량 미니게임 플랫폼. 닉네임 기반 플레이·기록·랭킹을 제공하고,
새로운 게임을 독립적으로 추가할 수 있는 구조를 지향한다.

## Status

**Phase 5 — Game Result 영속화 & 서버 검증** 완료.

- Phase 1: 모노레포 뼈대, 빌드 도구 체인, DB 스키마 초안
- Phase 2: 프레임워크에 종속되지 않는 Game Core (Game 계약, 플랫폼 라이프사이클, GameRegistry, Mock Game)
- Phase 3: Reaction Test 게임 엔진 + React 프레젠테이션
- Phase 4: Player / GameSession 도메인, REST API, GameRegistry와 연동된 세션 생성
- Phase 5: GameResult 영속화(GameResultService), 세션↔결과 무결성(중복 제출 방지), 트랜잭션 원자성, Reaction Test ↔ 결과 API 연동

랭킹, 인증, 리더보드 UI, 안티치트는 아직 구현하지 않았다.

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

# web
npm run dev:web
```

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
