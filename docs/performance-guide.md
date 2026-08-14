[← Game Templates](templates-guide.md) · [Back to README](../README.md) · [Godogen Analysis →](godogen-analysis.md)

# Performance Optimization Guide

Performance is a planning input, not a cleanup pass. Every generated game receives a LOW, MEDIUM, or HIGH budget before gameplay generation; AUTO resolves conservatively and may downgrade again at runtime.

## Budget Matrix

The source of truth is `src/performance/budgets.ts`.

| Limit | LOW | MEDIUM | HIGH |
| --- | ---: | ---: | ---: |
| Target FPS | 30 | 60 | 60 |
| Hardware scaling level | 2.0 | 1.25 | 1.0 |
| Shadows | Off | On | On |
| Shadow map | 0 | 1024 | 2048 |
| Post-processing | Off | Off | On |
| Max particles | 50 | 200 | 1,000 |
| Max texture edge | 512 px | 1024 px | 2048 px |
| LOD required | Yes | Yes | No |
| Max draw calls | 100 | 250 | 500 |
| Max triangles | 75,000 | 250,000 | 750,000 |
| Max texture memory | 64 MiB | 192 MiB | 512 MiB |
| Max lights | 2 | 4 | 8 |
| Max shadow casters | 0 | 12 | 40 |
| Max active meshes | 150 | 400 | 1,000 |
| Render distance | 60 | 120 | 240 |
| Max NPCs | 8 | 24 | 64 |

Budgets are ceilings, not targets to consume. A small puzzle should stay small even when HIGH is selected.

## Generation-Time Enforcement

`GamePlanner` includes the requested quality in the plan and tells the host agent to prefer procedural assets and low-end architecture. `GameArchitect` records the complete budget in `.factory/performance-budget.json`.

For Babylon.js projects, `applyBudget()` parses `src/main.ts` with the TypeScript compiler API and inserts a marked, idempotent block after `Engine`/`Scene` construction. It sets:

- `engine.setHardwareScalingLevel()`;
- `scene.shadowsEnabled`;
- `scene.particlesEnabled`;
- immutable constants for every remaining ceiling.

Reapplying a preset replaces the previous marked block. If engine construction cannot be found, the injector adds metadata only and logs that limitation.

Generated gameplay must use `FACTORY_PERFORMANCE_BUDGET` when deciding object pools, LOD thresholds, draw distance, NPCs, textures, and effects. Browser validation measures runtime behavior but does not rewrite an over-budget scene automatically.

## Runtime Quality Detection

`RuntimePerformanceMonitor` accepts an explicit preset or AUTO-like value. Explicit `LOW`, `MEDIUM`, and `HIGH` are respected at startup. Automatic selection checks:

- WebGL 2 availability;
- mobile user agent;
- `navigator.deviceMemory` when exposed;
- logical CPU count;
- device pixel ratio.

The current heuristic selects LOW for missing WebGL 2, mobile devices, at most 4 GiB memory, at most four logical CPUs, or device pixel ratio above 2. It selects HIGH only with at least 8 GiB and eight logical CPUs; otherwise it uses MEDIUM.

Capability data is approximate and privacy-limited, so sustained frame rate remains the final signal.

## Runtime Monitoring

The monitor samples `engine.getFps()` every 30 rendered frames. Two consecutive samples below 80% of the current target trigger one downgrade:

```text
HIGH (60 FPS target) -> MEDIUM (60 FPS target) -> LOW (30 FPS target)
```

On downgrade it changes Babylon hardware scaling, calls the optional `onQualityChanged` hook, and logs the transition. Use that hook in custom games to reduce particles, draw distance, reflections, NPCs, or water quality:

```ts
const monitor = new RuntimePerformanceMonitor(engine, requestedQuality, {
  onQualityChanged: (quality) => {
    particleSystem.emitRate = quality === "LOW" ? 10 : 40;
    expensiveReflectionProbe.refreshRate = quality === "HIGH" ? 1 : 0;
  },
});
```

The monitor publishes `fps`, `quality`, `hardwareScalingLevel`, and `targetFPS` to `window.__GAME_METRICS__`. The default top-right overlay is intended for development evidence; pass `{ showOverlay: false }` when a game provides its own diagnostics UI.

## Native 2D Performance

Canvas games do not initialize Babylon.js or the 3D monitor. Their entry point uses a fixed `960 x 540` world and caps backing-canvas device pixel ratio:

| Quality | DPR cap |
| --- | ---: |
| LOW | 1.0 |
| MEDIUM | 1.5 |
| HIGH | 2.0 |

Keep `update()` deterministic and render once per animation frame. For large 2D games:

- pool bullets, particles, and transient effects;
- spatially partition collision candidates instead of testing every pair;
- batch sprites by atlas and avoid per-frame image allocation;
- pre-render static backgrounds to an offscreen canvas;
- cap simulation catch-up to prevent a slow frame from causing a spiral;
- avoid canvas filters and large alpha layers in LOW;
- suspend simulation and audio while an advertisement or page pause is active.

## Babylon.js Low-End Practices

### Geometry and draw calls

- Prefer instances or thin instances for repeated obstacles and collectibles.
- Merge static environment meshes when material boundaries allow it.
- Use primitive or genuinely low-poly procedural geometry as the no-key baseline.
- Keep inactive pools disabled and outside active selection; do not merely hide them behind the camera.
- Use LOD in LOW and MEDIUM, and keep collision shapes simpler than rendered meshes.

### Materials and lighting

- Use one hemispheric light plus at most one directional light in LOW.
- Disable shadows in LOW; baked contrast or vertex colors are cheaper and more predictable.
- Reuse materials rather than creating one material per mesh.
- Avoid real-time reflection probes, refraction, screen-space effects, and transparent overlap in compatibility mode.

### Textures and memory

- Keep LOW textures at or below 512 px and use compressed web formats where the browser path is verified.
- Reuse atlases, avoid unnecessary alpha channels, and dispose temporary textures.
- Do not preload assets beyond the current level; slow network and small RAM are part of the target.
- Make every imported model and texture replaceable by a local or procedural asset.

### Simulation

- Clamp delta time after tab resumes.
- Use fixed or capped frequencies for AI and expensive queries instead of every render frame.
- Pool NPCs and projectiles, enforce `maxNPCs`, and reduce distant behavior updates.
- Prefer simple kinematic collision unless a mechanic genuinely requires a full physics runtime.

## Profiling Workflow

### 1. Reproduce the target preset

Generate or rebuild with LOW first. Confirm `.factory/performance-budget.json` and inspect the injected block in `src/main.ts`.

### 2. Run browser evidence

`BrowserTester` launches Chromium with software WebGL compatibility flags, waits for the ready signal, captures the screenshot, and reads runtime metrics. A healthy result has:

- no console or page errors;
- no failed local resource requests;
- `ready: true`;
- visible, non-uniform pixels;
- FPS close to the preset target after warm-up.

### 3. Identify the limiting resource

Use browser performance tools inside the generated project when the acceptance metric is insufficient:

| Symptom | Likely cause | First action |
| --- | --- | --- |
| High CPU, low GPU activity | Scripts, AI, collision, allocations | Sample main-thread tasks and reduce update frequency |
| High GPU time | Pixels, shadows, transparency, post-processing | Increase scaling level and disable effects |
| Spikes during spawning | Mesh/material/array allocation | Preallocate and pool |
| Slow initial frame | Large bundles or eager assets | Split optional content and defer level assets |
| Smooth scene, slow input | Event backlog or blocking work | Move heavy work out of input handlers |
| Black software-rendered frame | Unsupported shader/feature | Replace with StandardMaterial or procedural fallback |

### 4. Retest visual quality

Optimization is complete only when the game still communicates player, goal, hazards, score, and feedback at the reduced preset. Re-run capture after each material, camera, resolution, or culling change.

## Debugging Metrics

Set `LOG_LEVEL=debug` for factory logs. Generated browser logs use `VITE_LOG_LEVEL` when supplied at build time and include quality transitions and FPS warnings.

In a running game, inspect:

```js
window.__GAME_READY__
window.__GAME_METRICS__
```

Do not include large object graphs in metrics; browser capture accepts only strings, numbers, and booleans.

## Acceptance Gate

The LOW acceptance scenario asserts injected values (`hardwareScalingLevel: 2`, shadows disabled, `maxParticles: 50`) and a 30 FPS monitor sample. The complete suite also builds 2D/3D offline projects, performs visual repair, and inspects the production ZIP.

Run it with:

```bash
npm run test:acceptance
```

## See Also

- [Game Templates](templates-guide.md) — renderer-specific contracts
- [Architecture Deep Dive](architecture-deep-dive.md) — browser evidence and repair flow
- [Yandex Adaptations](yandex-adaptations.md) — low-end and platform design decisions
