// Phase A-F (MVP): types, ruleset/constants, piece shape data, board
// primitives + locking + line-clear/compression, the injectable 7-bag
// generator + peekable queue, collision/drop-distance, SRS rotation + wall
// kicks, time-driven gravity + Classic-style lock delay, Classic-style
// score/level progression, and TetrisGame itself covering spawn/movement/
// collision/locking/line-clear/game-over/rotation/gravity/scoring. The
// "pause"/"restart" TetrisInput variants exist but are no-ops in
// TetrisGame — restart is handled at the platform boundary via
// GameSession, same as every other game.

export {
  PIECE_TYPES,
  ROTATIONS,
  type PieceType,
  type Rotation,
  type PieceCellOffset,
  type ActivePiece,
  type Cell,
  type Board,
  type TetrisStatus,
  type TetrisState,
  type TetrisInput,
  type TetrisResultMetadata,
  type TetrisRuleset,
} from "./types";

export {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  BUFFER_ROWS,
  DEFAULT_GRAVITY_TABLE,
  DEFAULT_SCORING,
  DEFAULT_LINES_PER_LEVEL,
  DEFAULT_LOCK_DELAY_MS,
  DEFAULT_LOCK_DELAY_MAX_RESETS,
  DEFAULT_TETRIS_RULESET,
} from "./constants";

export { gravityIntervalMs } from "./gravity";

export { SPAWN_X, SPAWN_Y, spawnPiece, cellsForPiece, createEmptyBoard } from "./pieces";

export {
  boardWidth,
  boardHeight,
  isInBounds,
  getCell,
  isCellEmpty,
  mergePieceIntoBoard,
  getCompletedRows,
  clearCompletedRows,
} from "./board";

export { canPlace, getDropDistance } from "./collision";

export { getRotationCandidates, nextRotation, type RotationDirection } from "./rotation";

export {
  MathRandomSource,
  SevenBagGenerator,
  shuffledBag,
  type RandomSource,
  type BagSource,
} from "./generator";

export { PieceQueue, type PieceGenerator } from "./queue";

export { TetrisGame, tetrisMetadata } from "./tetris";
