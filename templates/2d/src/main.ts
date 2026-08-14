import { Game2D, WORLD_HEIGHT, WORLD_WIDTH } from "./game2d";
import { gameLog } from "./logger";
import "./style.css";
import { YandexGamesAdapter } from "./yandex/adapter";

async function bootstrap(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
  const context = canvas?.getContext("2d", { alpha: false });
  if (!canvas || !context) throw new Error("Canvas 2D is unavailable");
  const quality: string = "{{GAME_QUALITY}}";
  const dprCap = quality === "LOW" ? 1 : quality === "HIGH" ? 2 : 1.5;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    canvas.width = Math.round(WORLD_WIDTH * dpr);
    canvas.height = Math.round(WORLD_HEIGHT * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  const yandex = new YandexGamesAdapter();
  await yandex.init();
  const game = new Game2D(context);
  let previousTime = performance.now();
  let accumulator = 0;
  const fixedStep = 1 / 60;
  const frame = (time: number) => {
    accumulator += Math.min((time - previousTime) / 1_000, 0.1);
    previousTime = time;
    while (accumulator >= fixedStep) {
      game.update(fixedStep);
      accumulator -= fixedStep;
    }
    game.render();
    requestAnimationFrame(frame);
  };
  game.render();
  requestAnimationFrame(frame);
  document.querySelector<HTMLElement>("#loading")?.setAttribute("hidden", "");
  window.__GAME_READY__ = true;
  window.__GAME_METRICS__ = { mode: "2d", ready: true, dprCap };
  yandex.gameReady();
  gameLog("info", "Canvas 2D game is ready", { quality, dprCap });
}

bootstrap().catch((error: unknown) => {
  gameLog("error", "Canvas 2D bootstrap failed", { error: error instanceof Error ? error.message : String(error) });
  throw error;
});
