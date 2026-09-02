import {
  BOARD_HEIGHT,
  BOARD_ROWS,
  BOARD_WIDTH,
  colToX,
  rowToY,
  type SwipeBrickBreakerState,
} from "@mini-game-hub/game-core";

/** Muted, low-saturation fill per HP tier — the HP number, not the color, is what communicates durability. */
const BRICK_FILL_BY_TIER = ["#e5e5e5", "#d4d4d4", "#a3a3a3", "#78716c", "#57534e"];
const BRICK_TEXT_LIGHT = "#fafaf9";
const BRICK_TEXT_DARK = "#292524";

function brickFill(hp: number): { fill: string; textColor: string } {
  const tier = Math.min(hp, BRICK_FILL_BY_TIER.length) - 1;
  const fill = BRICK_FILL_BY_TIER[Math.max(0, tier)];
  return { fill, textColor: tier >= 2 ? BRICK_TEXT_LIGHT : BRICK_TEXT_DARK };
}

const LAUNCH_X = BOARD_WIDTH / 2;
const LAUNCH_Y = BOARD_HEIGHT - 0.3;

/**
 * Renders one frame of the board onto `ctx`. Pure/imperative — reads the
 * current logical state and draws it at whatever pixel scale the canvas
 * currently is; never mutates game state. `scale` converts logical board
 * units to CSS pixels (the caller has already sized the canvas's drawing
 * buffer for devicePixelRatio and applied that as a transform).
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  state: SwipeBrickBreakerState,
  scale: number,
  aimAngleRad: number | null,
): void {
  const widthPx = BOARD_WIDTH * scale;
  const heightPx = BOARD_HEIGHT * scale;

  // Background.
  ctx.fillStyle = "#fafaf9";
  ctx.fillRect(0, 0, widthPx, heightPx);

  // Subtle grid (brick-grid rows only).
  ctx.strokeStyle = "#f0efed";
  ctx.lineWidth = 1;
  for (let col = 0; col <= 7; col++) {
    const x = colToX(col) * scale;
    ctx.beginPath();
    ctx.moveTo(x, rowToY(0) * scale);
    ctx.lineTo(x, rowToY(BOARD_ROWS) * scale);
    ctx.stroke();
  }
  for (let row = 0; row <= BOARD_ROWS; row++) {
    const y = rowToY(row) * scale;
    ctx.beginPath();
    ctx.moveTo(colToX(0) * scale, y);
    ctx.lineTo(colToX(BOARD_WIDTH) * scale, y);
    ctx.stroke();
  }

  // Danger boundary — the bottom edge of the brick grid.
  ctx.strokeStyle = "#fbbf24";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, rowToY(BOARD_ROWS) * scale);
  ctx.lineTo(widthPx, rowToY(BOARD_ROWS) * scale);
  ctx.stroke();
  ctx.setLineDash([]);

  // Bricks.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(10, scale * 0.32)}px system-ui, sans-serif`;
  for (const brick of state.bricks) {
    const x = colToX(brick.col) * scale;
    const y = rowToY(brick.row) * scale;
    const size = scale;
    const { fill, textColor } = brickFill(brick.hp);
    const r = Math.min(6, size * 0.12);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, size - 2, size - 2, r);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.fillText(String(brick.hp), x + size / 2, y + size / 2 + 1);
  }

  // Launch point.
  const launchXPx = LAUNCH_X * scale;
  const launchYPx = LAUNCH_Y * scale;
  ctx.fillStyle = "#78716c";
  ctx.beginPath();
  ctx.arc(launchXPx, launchYPx, Math.max(2, scale * 0.05), 0, Math.PI * 2);
  ctx.fill();

  // Aim guide.
  if (aimAngleRad !== null) {
    const guideLength = BOARD_HEIGHT * 0.55;
    const endX = LAUNCH_X + Math.sin(aimAngleRad) * guideLength;
    const endY = LAUNCH_Y - Math.cos(aimAngleRad) * guideLength;
    ctx.strokeStyle = "#a8a29e";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(launchXPx, launchYPx);
    ctx.lineTo(endX * scale, endY * scale);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Balls.
  ctx.fillStyle = "#44403c";
  for (const ball of state.balls) {
    if (!ball.active) {
      continue;
    }
    ctx.beginPath();
    ctx.arc(ball.x * scale, ball.y * scale, ball.radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}
