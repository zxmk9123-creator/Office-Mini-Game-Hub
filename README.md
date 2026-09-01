# Office Mini Game Hub

업무 중 짧은 시간에 부담 없이 즐길 수 있는 초경량 미니게임 플랫폼. 닉네임 기반 플레이·기록·랭킹을 제공하고,
새로운 게임을 독립적으로 추가할 수 있는 구조를 지향한다.

## Status

**Phase 1 — Foundation** 완료. 모노레포 뼈대, 빌드 도구 체인, DB 스키마 초안까지 세팅되어 있다.
Game Interface / Game Registry / Reaction Test 구현은 Phase 2부터 진행한다.

## Structure

```text
mini-game-hub/
├── apps/
│   ├── web/      React + TypeScript + Vite + Tailwind CSS
│   └── server/   Node.js + Express + TypeScript
├── packages/
│   ├── database/  Drizzle ORM schema (players, games, game_sessions, game_results)
│   ├── shared/    공통 타입 (Zod, scoreType 등)
│   └── game-core/ Game Interface / Registry (Phase 2에서 구현)
```

## Getting started

```bash
npm install

# server (needs a running Postgres; see .env.example)
cp .env.example .env
npm run dev:server

# web
npm run dev:web
```

## Stack

React · TypeScript · Vite · Tailwind CSS · Node.js · Express · PostgreSQL · Drizzle ORM · Zod
