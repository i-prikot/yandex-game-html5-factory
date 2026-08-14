import { clampToWorld, intersects, type RectBody } from "./physics2d";
import { gameLog } from "./logger";

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;

interface GameState {
  player: RectBody;
  goal: RectBody;
  obstacles: RectBody[];
  score: number;
}

export class Game2D {
  private readonly keys = new Set<string>();
  private readonly state: GameState = {
    player: { x: 80, y: 250, width: 46, height: 46 },
    goal: { x: 820, y: 230, width: 34, height: 70 },
    obstacles: [
      { x: 330, y: 165, width: 45, height: 210 },
      { x: 610, y: 0, width: 45, height: 245 },
    ],
    score: 0,
  };

  public constructor(private readonly context: CanvasRenderingContext2D) {
    gameLog("info", "Initializing native Canvas 2D scene", { width: WORLD_WIDTH, height: WORLD_HEIGHT });
    window.addEventListener("keydown", (event) => this.keys.add(event.code));
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
  }

  public update(deltaSeconds: number): void {
    const previous = { ...this.state.player };
    const speed = 240;
    const horizontal = Number(this.keys.has("ArrowRight") || this.keys.has("KeyD"))
      - Number(this.keys.has("ArrowLeft") || this.keys.has("KeyA"));
    const vertical = Number(this.keys.has("ArrowDown") || this.keys.has("KeyS"))
      - Number(this.keys.has("ArrowUp") || this.keys.has("KeyW"));
    this.state.player.x += horizontal * speed * deltaSeconds;
    this.state.player.y += vertical * speed * deltaSeconds;
    clampToWorld(this.state.player, WORLD_WIDTH, WORLD_HEIGHT);
    if (this.state.obstacles.some((obstacle) => intersects(this.state.player, obstacle))) {
      Object.assign(this.state.player, previous);
    }
    if (intersects(this.state.player, this.state.goal)) {
      this.state.score += 1;
      this.state.player.x = 80;
      this.state.player.y = 250;
    }
  }

  public render(): void {
    const context = this.context;
    context.fillStyle = "#17212b";
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.fillStyle = "#213a4a";
    for (let x = 0; x < WORLD_WIDTH; x += 48) context.fillRect(x, 0, 1, WORLD_HEIGHT);
    for (let y = 0; y < WORLD_HEIGHT; y += 48) context.fillRect(0, y, WORLD_WIDTH, 1);
    context.fillStyle = "#e34d59";
    this.state.obstacles.forEach((obstacle) => context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height));
    context.fillStyle = "#5bd6a2";
    context.fillRect(this.state.goal.x, this.state.goal.y, this.state.goal.width, this.state.goal.height);
    context.fillStyle = "#ffd454";
    context.fillRect(this.state.player.x, this.state.player.y, this.state.player.width, this.state.player.height);
    context.fillStyle = "#ffffff";
    context.font = "700 24px Arial";
    context.fillText(`{{GAME_TITLE}}  ${this.state.score}`, 24, 38);
  }
}
