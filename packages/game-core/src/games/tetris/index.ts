// Phase A only: types, ruleset/constants, piece shape data, board
// primitives, and the injectable 7-bag generator + peekable queue.
// TetrisGame (the Game contract implementation), collision, rotation
// (SRS + wall kicks), scoring, level, and gravity/time are later phases —
// not implemented yet, and this module is intentionally NOT registered in
// gameRegistry.ts until they are.

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
  DEFAULT_TETRIS_RULESET,
} from "./constants";

export { SPAWN_X, SPAWN_Y, spawnPiece, cellsForPiece, createEmptyBoard } from "./pieces";

export { boardWidth, boardHeight, isInBounds, getCell, isCellEmpty } from "./board";

export {
  MathRandomSource,
  SevenBagGenerator,
  shuffledBag,
  type RandomSource,
  type BagSource,
} from "./generator";

export { PieceQueue, type PieceGenerator } from "./queue";
