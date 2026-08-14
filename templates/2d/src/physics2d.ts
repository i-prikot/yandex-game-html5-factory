export interface RectBody {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function intersects(left: RectBody, right: RectBody): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

export function clampToWorld(body: RectBody, worldWidth: number, worldHeight: number): void {
  body.x = Math.max(0, Math.min(worldWidth - body.width, body.x));
  body.y = Math.max(0, Math.min(worldHeight - body.height, body.y));
}
