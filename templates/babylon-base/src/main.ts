import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";

import { createGame } from "./game";
import { gameLog } from "./logger";
import { RuntimePerformanceMonitor } from "./performance/monitor";
import "./style.css";
import { YandexGamesAdapter } from "./yandex/adapter";

async function bootstrap(): Promise<void> {
  gameLog("debug", "Bootstrapping Babylon template", { title: "{{GAME_TITLE}}" });
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
  if (!canvas) throw new Error("Game canvas was not found");

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false });
  const scene = new Scene(engine);
  const monitor = new RuntimePerformanceMonitor(engine, "{{GAME_QUALITY}}");
  const render = () => {
    scene.render();
    monitor.onFrame();
  };
  const yandex = new YandexGamesAdapter({
    onPause: () => engine.stopRenderLoop(render),
    onResume: () => engine.runRenderLoop(render),
  });
  await yandex.init();
  await createGame(scene, canvas);

  engine.runRenderLoop(render);
  window.addEventListener("resize", () => engine.resize());
  await scene.whenReadyAsync();
  scene.render();
  document.querySelector<HTMLElement>("#loading")?.setAttribute("hidden", "");
  window.__GAME_READY__ = true;
  window.__GAME_METRICS__ = { ...window.__GAME_METRICS__, mode: "3d", ready: true };
  yandex.gameReady();
  gameLog("info", "Game is ready");
}

bootstrap().catch((error: unknown) => {
  gameLog("error", "Game bootstrap failed", { error: error instanceof Error ? error.message : String(error) });
  throw error;
});
