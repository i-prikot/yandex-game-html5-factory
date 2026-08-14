[← Performance Guide](performance-guide.md) · [Back to README](../README.md) · [Yandex Adaptations →](yandex-adaptations.md)

# Godogen architecture analysis

## Scope and source revision

The analysis is based on the current `htdt/godogen` source tree inspected on
2026-08-14, including `prompts/runtime.md`, `engines/babylon.md`, `asset-gen/`,
`scripts/`, `publish.sh`, `AGENTS.md`, `CLAUDE.md`, and `docs/PROJECT.md`.
Godogen currently has no `shared/` or engine-specific source application. Its
shared layer is expressed as documentation, a publish script, and the portable
asset-generation skill.

## Actual architecture

Godogen is a source publisher, not a long-running generator service. The flow is:

```text
Godogen source
  -> publish.sh --engine <engine> --agent <host>
  -> thin game repository (manifest + engine guide + asset skill)
  -> Claude Code or Codex builds and iterates on the game
  -> running game and capture prove the result
```

`publish.sh` resolves two independent dimensions at publish time:

- engine: Godot, Bevy, or Babylon.js;
- host agent: Claude Code or Codex.

It renders the common runtime prompt into `CLAUDE.md` or `AGENTS.md`, copies one
engine guide, installs the asset skill in the host-specific skill directory,
and generates Codex metadata when needed. This separation is the most reusable
part of the design.

## Engine-agnostic mechanisms

- A natural-language brief is the primary input.
- Durable state lives in the generated repository, so work survives context
  compaction and agent restarts.
- The host agent plans and decomposes work dynamically; there is no prescribed
  multi-stage implementation protocol in current Godogen.
- Paid asset generation is isolated behind one portable skill with explicit
  cost awareness, sidecar state for resumable jobs, and a manifest of generated
  assets.
- "Proof over claims" is a hard completion condition: compilation is only a
  structural gate; the agent must inspect the running game or a proof video.
- Open-ended briefs can use live collaboration, while complete specifications
  run autonomously and finish with recorded proof.
- Engine knowledge is kept in small guides that contain only non-obvious stack,
  capture, and runtime failure details.

## Babylon.js-specific mechanisms

- TypeScript, Vite, Node.js 22+, `@babylonjs/core`, and
  `@babylonjs/loaders` form a browser-native pipeline.
- The Vite server binds to `0.0.0.0` on a fixed port so a user or browser runner
  can observe the current game.
- Gameplay uses Babylon's render observable and engine delta rather than a
  fixed frame rate.
- Modular subpath imports support tree-shaking, while explicit side-effect
  imports register features that otherwise compile but fail at runtime.
- Havok requires its WASM in `public/`, an explicit locator, and physics module
  registration.
- Capture opens the live URL in Chrome/Chromium, waits for an application-ready
  signal, gathers screenshots or timed frames, and checks the WebGL renderer.
- SwiftShader, llvmpipe, and lavapipe are detected because software rendering
  can be slow or blank. Hardware capture is preferred but not required by the
  new factory.

## Planning, generation, verification, and repair

Godogen does not ship a planner service, code generator, visual classifier, or
patch loop. The runtime manifest delegates these capabilities to the selected
host agent. Repair emerges from a required behavior:

```text
implement -> compile -> run -> capture -> inspect -> revise -> run again
```

This is intentionally flexible, but it is unsuitable for repeatable mass game
production. The Yandex Games Factory should preserve the feedback loop while
making stages, artifacts, iteration limits, logs, and failure states explicit.

## Asset generation findings

The shared asset skill supports Gemini and xAI image generation, Tripo3D model
generation and rigging, video-derived animation frames, background removal,
grid slicing, and resumable paid jobs. It contains strong operational knowledge:

- confirm cost before paid calls;
- review a source image before converting it to 3D;
- use solid backgrounds and perform matting afterward;
- use reference images to keep a family of assets consistent;
- persist remote task identifiers so timeouts do not trigger duplicate charges;
- visually inspect assets and track their intended in-game scale.

The current skill assumes paid services are available for generated art. That
assumption cannot be transferred to an offline-first factory.

## Mechanisms to transfer

1. Separate the host-agent provider from engine and platform implementation.
2. Keep generated games independent from the factory that created them.
3. Treat build success as a compile gate, never as completion evidence.
4. Capture the running browser, console errors, failed requests, WebGL renderer,
   screenshot, readiness state, and performance metrics.
5. Wait for an explicit ready signal before evaluating pixels.
6. Preserve modular Babylon.js imports and document side-effect registration.
7. Keep asset acquisition behind a dedicated pipeline with provenance and
   fallbacks.
8. Persist pipeline state and make repair bounded and repeatable.

## Mechanisms not to copy directly

- Do not copy Godot or Bevy guidance into a Babylon-only product.
- Do not rely on a thin prompt to recreate scaffolding and browser tooling on
  every run; stable factory-owned modules are more reliable for mass output.
- Do not make paid generation or a GPU mandatory.
- Do not copy the destructive `publish.sh --force` workflow into project
  generation; output paths must be validated and collision-safe.
- Do not assume visual review is available from every host provider. Deterministic
  pixel, DOM, console, request, and performance checks must remain available.
- Do not expose asset API keys to generated Vite projects or browser bundles.

## Required adaptations

### Windows

Run Node.js, Chromium, ffmpeg, and all shell-oriented tooling inside Docker.
Expose batch scripts that call Docker Compose, use bind mounts with normalized
container paths, avoid WSL as a prerequisite, and handle Windows file locking
and process termination explicitly.

### Docker and GPU fallback

Use Chromium from the image and launch with sandbox-compatible flags. The MVP
uses software WebGL for reproducible CPU-only validation instead of assuming a
host GPU. A future accelerated profile must probe the actual renderer and fall
back to this compatibility launch rather than aborting. Capture quality and
timeouts must account for slower software rendering.

### Yandex Games

Generated projects need a platform adapter for SDK initialization, loading-ready
notification, pause/resume, ads, player data, cloud saves, fullscreen, language,
and local mock behavior. The final archive must use relative URLs, include its
entry point at the archive root, and contain no factory credentials.

### Low-end computers

Performance budgets must influence planning before code generation. Runtime
capability detection selects LOW, MEDIUM, or HIGH and can reduce render scale,
shadows, lights, particles, texture sizes, active meshes, draw distance,
post-processing, physics frequency, and NPC counts. The LOW path must be an
ordinary supported configuration, not an error fallback.

### Native 2D

Use Canvas 2D with a fixed-step update and responsive display scaling for
platformers, puzzles, clickers, idle games, and other sprite-based genres. It is
cheaper than constructing a Babylon 3D scene and remains independently testable
with the same ready, error, screenshot, and performance contracts.

### Babylon.js 3D

Use modular Babylon.js packages, simple materials and procedural meshes by
default, delta-time gameplay, explicit disposal, instance/LOD strategies, and
quality-aware scene construction. Optional imported assets must always have a
procedural replacement.

### No external asset API keys

Missing `GOOGLE_API_KEY`, `XAI_API_KEY`, or `TRIPO3D_API_KEY` is a normal state.
The resolver skips unavailable providers, searches the local catalog, and then
generates procedural Canvas/SVG textures, audio-independent UI, or Babylon
primitives. Code generation still uses the selected local host agent (Claude
Code or Codex); generated games never call asset APIs at runtime.

## Consequence for the factory

Godogen supplies the engineering principles and the Babylon runtime traps, not
an application framework to fork. The factory therefore needs an engine-agnostic
orchestrator with explicit roles, provider adapters, project scaffolding, asset
fallbacks, browser evidence, deterministic validation, bounded self-repair,
performance budgets, Yandex packaging, and durable per-run artifacts.

## See Also

- [Architecture Deep Dive](architecture-deep-dive.md) — implemented component boundaries and data flow
- [Yandex Adaptations](yandex-adaptations.md) — platform-specific decisions derived from the research
- [Performance Guide](performance-guide.md) — current low-end limits and runtime behavior
