[← API Reference](api.md) · [Back to README](../README.md) · [Performance Guide →](performance-guide.md)

# Game Templates Guide

Templates are source starting points, not finished games or scene-editor projects. The factory copies one into a new repository, applies placeholders and budgets, then asks the host agent to replace the gameplay module while preserving runtime contracts.

## Template Layout

```text
templates/
├── 2d/
│   ├── index.html
│   ├── package.json, tsconfig.json, vite.config.ts
│   ├── presets/*.json
│   └── src/
│       ├── main.ts, game2d.ts, physics2d.ts
│       ├── logger.ts, style.css, globals.d.ts
│       └── yandex/adapter.ts
├── babylon-base/
│   ├── index.html
│   ├── package.json, tsconfig.json, vite.config.ts
│   └── src/
│       ├── main.ts, game.ts, logger.ts, style.css, globals.d.ts
│       ├── performance/monitor.ts
│       └── yandex/adapter.ts
└── 3d/
    ├── presets/*.json
    └── src/game.ts, game3d.ts, physics3d.ts
```

`ScaffoldGenerator` copies `2d/` for native games. For 3D it copies `babylon-base/` first and overlays `3d/`, so `src/game.ts` re-exports the 3D implementation.

Template copying excludes existing `node_modules/` and `dist/`. Generated projects install their own dependencies and remain independent from the factory.

## Shared Runtime Contract

Every template must satisfy these browser and packaging gates:

| Contract | Requirement |
| --- | --- |
| Entry | `index.html` loads `/src/main.ts` during development |
| Build | `npm run build` performs TypeScript checking and `vite build` |
| URLs | Vite `base` is `./` for relative production assets |
| Ready | Set `window.__GAME_READY__ = true` only after a visible playable frame |
| Metrics | Publish scalar values through `window.__GAME_METRICS__` |
| Evidence | Render meaningful contrast at the 1280 x 720 test viewport |
| SDK | Include `https://yandex.ru/games/sdk/v2` in `index.html` |
| Local mode | Start without `window.YaGames` and use the mock adapter |
| Secrets | Never read factory API keys or expose them through `import.meta.env` |

Placeholders are replaced in HTML, JSON, TypeScript, CSS, and Markdown:

| Placeholder | Example |
| --- | --- |
| `{{GAME_TITLE}}` | `Tank Arena Lite` |
| `{{GAME_SLUG}}` | `tank-arena-lite` |
| `{{GAME_QUALITY}}` | `LOW` |
| `{{GAME_GENRE}}` | `racing` |

## Native Canvas 2D

The 2D path deliberately has no Babylon.js dependency. `main.ts` creates a fixed-resolution `960 x 540` backing world, caps device pixel ratio by quality, and runs a fixed 60 Hz update accumulator. CSS stretches the canvas responsively without changing world coordinates.

`Game2D` is the gameplay replacement contract:

```ts
export class Game2D {
  constructor(context: CanvasRenderingContext2D);
  update(deltaSeconds: number): void;
  render(): void;
}
```

The starting implementation uses keyboard movement, AABB collision from `physics2d.ts`, geometric rendering, score text, and no external asset. Agents can add pointer/touch input, sprite atlases, audio, and level data while preserving `update()` and `render()`.

### 2D starting presets

| Preset | Suggested mechanics |
| --- | --- |
| `platformer` | Run, jump, platforms, collectibles |
| `top-down-shooter` | Movement, aim, projectiles, waves |
| `clicker` | Click reward, upgrades, save state |
| `idle` | Passive income, offline progress, upgrades |
| `puzzle` | Grid, moves, win condition, progression |

Preset JSON is planning metadata copied with the project. It does not execute gameplay by itself; the host agent uses the chosen genre and mechanics to adapt `game2d.ts`.

## Babylon.js 3D

The 3D path uses modular `@babylonjs/core` imports. `babylon-base/src/main.ts` owns `Engine`, `Scene`, render lifecycle, performance monitoring, Yandex initialization, ready state, and metrics.

The gameplay replacement contract is:

```ts
export async function createGame(
  scene: Scene,
  canvas: HTMLCanvasElement,
): Promise<void>;
```

`game3d.ts` creates the camera, lighting, geometry, materials, controls, and update observer. `physics3d.ts` provides cheap kinematic gravity and sphere collision without a mandatory WASM physics engine.

### 3D starting presets

| Preset | Suggested mechanics |
| --- | --- |
| `third-person-arena` | Movement, targeting, waves, pickups |
| `first-person-shooter` | Pointer look, movement, hitscan, targets |
| `racing` | Steering, acceleration, checkpoints, lap timer |
| `endless-runner` | Lane changes, jumps, obstacles, distance |
| `simple-survival` | Movement, resources, pressure, health |

All 3D gameplay must use the injected performance constants as hard caps. LOW should prefer primitive/instanced geometry, unlit or simple materials, no shadows, few lights, and procedural assets.

## Yandex Games Integration

The generated adapter is the only module that reads `window.YaGames`. Its current public operations are:

```ts
await yandex.init();
yandex.gameReady();
await yandex.showFullscreenAd();
await yandex.showRewardedAd();
const player = await yandex.getPlayer();
await player.setData({ highScore: 1200 });
```

Ad callbacks pause and resume the render loop supplied by the game entry. When the SDK is absent or initialization fails, advertisements resolve safely and player data uses `localStorage`. `gameReady()` calls `features.LoadingAPI.ready()` only when that capability exists.

For new platform features, add a capability check to the adapter and keep the same local fallback rule. Do not access `YaGames` directly from gameplay modules.

## Create a Custom Preset

A preset extends planning guidance within an existing renderer:

1. Add `templates/2d/presets/brick-breaker.json` or `templates/3d/presets/vehicle-arena.json`.
2. Keep the schema to `genre` and a concise `mechanics` string array.
3. Teach planner classification in `src/agents/game-planner.ts` when deterministic offline recognition is required.
4. Add a planner or acceptance test proving the brief selects the intended renderer and genre.
5. Keep the existing gameplay export contract; the preset does not need orchestrator changes.

Example:

```json
{
  "genre": "brick-breaker",
  "mechanics": ["paddle movement", "ball reflection", "brick grid", "lives"]
}
```

## Create a Custom Template Family

A new renderer family requires more than a preset. Start by copying the closest existing template and provide:

- `package.json` with `dev`, `build`, and `preview` scripts;
- `vite.config.ts` with `base: "./"`;
- `index.html`, entry module, CSS, logger, global ready/metrics declarations;
- a Yandex adapter with local fallback;
- one stable gameplay module contract;
- a visually inspectable procedural default scene;
- LOW-compatible behavior and no required network assets.

Then update the renderer union and selection branches in `ScaffoldGenerator`, `GamePlan`, planner validation, CLI schema, gameplay target selection, and acceptance tests. The current MVP has no dynamic template registry, so dropping a folder under `templates/` alone does not register a new renderer.

## Validate Template Changes

Run source checks and build both generated runtimes:

```bash
npm run typecheck
npm test -- --run tests/scaffold tests/templates
npm --prefix templates/2d run build
npm --prefix templates/babylon-base run build
```

For changes to ready state, camera, layout, resources, or performance, also run a real `BrowserTester` capture or the full acceptance suite. Compilation alone is not visual proof.

## See Also

- [API Reference](api.md) — scaffold, provider, and asset extension contracts
- [Performance Guide](performance-guide.md) — LOW/MEDIUM/HIGH limits
- [Yandex Adaptations](yandex-adaptations.md) — platform fallback and security decisions
