# Yandex Games Factory adaptations

## Product boundary

Godogen publishes instructions into a repository and lets a host agent invent
the remaining toolchain. Yandex Games Factory is a repeatable local service. It
owns orchestration, project templates, evidence capture, repair limits,
performance budgets, platform validation, and packaging. The generated game is
a standalone Vite project and has no runtime dependency on the factory.

## Key differences from Godogen

| Concern | Godogen | Yandex Games Factory |
| --- | --- | --- |
| Runtime | Thin agent manifest | Deterministic TypeScript orchestrator |
| Engines | Godot, Bevy, Babylon.js | Canvas 2D and Babylon.js 3D |
| Platform | General game output | Yandex Games HTML5 package |
| Assets | Paid generation skill | AI -> local -> procedural fallback |
| API keys | Expected for generated art | Entirely optional |
| Verification | Agent-directed capture | Browser evidence plus deterministic gates |
| Repair | Emergent agent iteration | Bounded, logged repair loop |
| Deployment | Host environment | Docker-first, Windows-compatible |
| Performance | Engine-dependent | Planning-time and runtime budgets |

## Yandex Games adapter contract

The adapter is the only game module that can access `window.YaGames`. It exposes
an implementation-neutral interface and switches to an in-memory mock when the
SDK is unavailable locally.

Required responsibilities:

- initialize SDK once and expose initialization state;
- call `features.LoadingAPI.ready()` only after the first playable frame;
- pause simulation and audio during advertisements or page deactivation;
- resume safely without accumulating delta time;
- show fullscreen and rewarded ads with closed/error callbacks;
- obtain player identity only after explicit initialization and tolerate an
  unauthorized player;
- read and write player data, with local storage as the development fallback;
- expose language, device information, fullscreen, and platform events;
- leave achievements/leaderboards behind capability checks because platform
  availability and game configuration differ;
- never fail game startup solely because the SDK, player, ads, or cloud storage
  is unavailable.

Production validation checks the SDK script, adapter initialization, ready
notification, pause/resume hooks, relative asset paths, archive root layout,
and absence of secret-looking environment values.

## Asset fallback pipeline

The logical preference is highest available fidelity without making network
services mandatory:

```text
request
  -> Level 3: optional AI provider (only with matching server-side key)
  -> Level 2: tagged local catalog with license metadata
  -> Level 1: deterministic procedural generator
```

Every result records `source`, `path` or generated module, license/provenance,
and fallback reason. Failure at one level is logged and continues to the next.

| Request | AI option | Local option | Procedural fallback |
| --- | --- | --- | --- |
| 3D character | Tripo3D | local GLB | primitive humanoid |
| 3D prop | Tripo3D | tagged GLB | box/sphere/cylinder composition |
| Texture | xAI/Google | PNG/WebP catalog | Canvas checker/stripes/noise |
| 2D sprite | xAI/Google | SVG/PNG catalog | Canvas/SVG geometric sprite |
| UI | none required | icon/font catalog | CSS and text |

All keys are read only by the factory process. They are excluded from template
copying, Vite environment prefixes, generated source, build output, and ZIP
packages.

## Performance budgets

Budgets are planning constraints and validation thresholds. A game plan that
cannot fit its target preset must reduce scope before implementation.

| Budget | LOW | MEDIUM | HIGH |
| --- | ---: | ---: | ---: |
| target FPS | 30 | 60 | 60 |
| hardware scaling level | 2.0 | 1.25 | 1.0 |
| max draw calls | 80 | 180 | 350 |
| max visible triangles | 75,000 | 250,000 | 750,000 |
| max texture memory | 64 MiB | 160 MiB | 384 MiB |
| max texture edge | 512 px | 1024 px | 2048 px |
| max active meshes | 100 | 300 | 700 |
| max particles | 50 | 250 | 1,000 |
| max dynamic lights | 1 | 3 | 6 |
| max shadow casters | 0 | 8 | 24 |
| render distance multiplier | 0.55 | 0.8 | 1.0 |
| physics frequency | 30 Hz | 60 Hz | 60 Hz |
| post-processing | off | off | optional |

For Canvas 2D the same presets constrain DPR, entity count, particles, update
frequency, and backing canvas resolution; they do not initialize Babylon.js.

## Runtime quality selection

`AUTO` begins with a conservative estimate based on WebGL availability, mobile
status, device memory, logical CPU count, screen pixel count, device pixel
ratio, renderer string, and a short frame sample. Explicit LOW/MEDIUM/HIGH is
respected unless required WebGL capabilities are missing.

The runtime monitor uses hysteresis to avoid quality flapping:

- degrade after sustained FPS below 85% of target;
- wait at least 10 seconds between changes;
- upgrade only after sustained headroom and never above the requested cap;
- apply render scale first, then particles/distance, then optional effects;
- emit a structured `factory:metrics` snapshot for browser validation.

## Browser evidence and repair

Each test run produces a JSON artifact with URL, readiness, browser errors,
console errors, failed requests, renderer, viewport, screenshot path, pixel
statistics, and runtime metrics. Deterministic checks detect blank/near-solid
frames and missing UI even without a vision-capable model. A provider can add a
semantic review, but cannot waive structural failures.

Repair is bounded to five iterations:

```text
build -> serve -> capture -> validate -> diagnose -> patch -> rebuild
```

Every iteration retains evidence. Exhaustion is a failed pipeline, not a
successful build with a warning.

## Windows and Docker

- Docker Desktop is the only mandatory development prerequisite on Windows.
- Node.js, Chromium, zip utilities, and fonts live in the image.
- Bind mounts expose `projects/`, `output/`, and evidence to the host.
- Chromium first attempts normal headless WebGL and falls back to software
  compatibility mode; NVIDIA is never assumed.
- `start.bat` starts the interactive factory and `build.bat` builds a named
  project/package.
- Child processes are terminated in `finally` blocks so Windows-mounted project
  files are not left locked.

## Security rules

- Reject project names containing traversal, separators, or control characters.
- Resolve every generated path under configured workspace roots.
- Spawn commands without a shell and pass user text only as arguments/data.
- Redact keys and authorization headers from structured logs.
- Do not copy `.env`, factory logs, screenshots, prompts, or source-generation
  metadata into the production game archive.
- Validate archives from their extracted file list before release.
