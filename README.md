# Yandex Games AI Factory

> A Docker-first autonomous factory that turns a game brief into an independent HTML5 game for Yandex Games.

The factory plans a Canvas 2D or Babylon.js 3D game, generates code and assets, runs it in Chromium, reviews a screenshot, repairs failures, applies a hardware budget, and produces a standalone ZIP. Claude Code and Codex are interchangeable host agents; Google, xAI, and Tripo3D asset keys are optional.

## Quick Start

Windows requires Docker Desktop only:

```bat
git clone https://github.com/i-prikot/yandex-game-html5-factory.git
cd yandex-game-html5-factory
start.bat
```

On macOS or Linux, run the same flow through Docker Compose:

```bash
cp .env.example .env
docker compose build factory
docker compose run --rm --service-ports factory npm run cli
```

Authenticate at least one host agent before creating a game. Credentials may be supplied through `.env` or persisted in the `claude-config` and `codex-config` Docker volumes.

## What It Builds

- **Native 2D**: Canvas 2D, fixed-step updates, AABB collisions, responsive scaling, and no Babylon.js dependency.
- **Modular 3D**: Babylon.js ES modules, TypeScript, Vite, lightweight physics, and quality-aware scenes.
- **Offline-first assets**: optional AI generation, then the local catalog, then deterministic SVG/Canvas/Babylon primitives.
- **Proof over claims**: build, browser launch, console and request capture, screenshot analysis, bounded repair, and retest.
- **Yandex-ready output**: SDK v2 adapter, local mock, ads/player data hooks, relative URLs, secret scan, and ZIP packaging.

## Example

Run `start.bat` and answer the prompts:

```text
Game title: Tank Arena Lite
Game description: A simple 3D tank arena with enemies, pickups, and low-end PC support.
Game type: 3D
Target device / quality: LOW / compatibility
AI agent: AUTO
```

The finished artifacts are separate from the factory:

```text
projects/tank-arena-lite/             independent Vite source project
projects/tank-arena-lite/dist/        production HTML5 game
output/packages/tank-arena-lite.zip   upload package for Yandex Games
```

Rebuild an existing game on Windows with:

```bat
build.bat tank-arena-lite
```

## Configuration

Copy `.env.example` to `.env`. Empty asset API keys are supported.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | `auto` | Select `claude`, `codex`, or automatic detection |
| `GAME_QUALITY` | `auto` | Select `LOW`, `MEDIUM`, `HIGH`, or runtime detection |
| `GOOGLE_API_KEY` | empty | Optional image generation |
| `XAI_API_KEY` | empty | Optional image generation |
| `TRIPO3D_API_KEY` | empty | Optional 3D generation |
| `YGG_SDK_ENABLED` | `true` | Enable the Yandex Games SDK adapter |
| `LOG_LEVEL` | `debug` | Structured log threshold; supports `silent` |

API keys stay in the factory process. They are not copied into generated source, Vite bundles, Docker images, or production ZIP files.

## Project Structure

```text
src/             factory agents, providers, pipeline, browser proof, assets, performance
templates/2d/    standalone native Canvas 2D starting points
templates/3d/    Babylon.js genre overlays
templates/babylon-base/  shared Babylon.js and Yandex runtime
assets/library/  local fallback catalog
projects/        generated independent game repositories
output/          final packages and temporary acceptance artifacts
tests/           unit, integration, and seven acceptance scenarios
docs/            research and implementation guides
```

## Development

With Node.js 22.12+ installed locally:

```bash
npm ci --include=dev
npm run typecheck
npm test
npm run test:acceptance
```

The supported Windows user path remains Docker; local Node.js is only needed for factory development.

## Documentation

| Guide | Description |
| --- | --- |
| [Architecture Deep Dive](docs/architecture-deep-dive.md) | Components, data flow, repair loop, and Godogen differences |
| [API Reference](docs/api.md) | Public TypeScript APIs and extension examples |
| [Game Templates](docs/templates-guide.md) | 2D/3D templates, presets, and Yandex integration |
| [Performance Guide](docs/performance-guide.md) | Budgets, runtime adaptation, and profiling |
| [Godogen Analysis](docs/godogen-analysis.md) | Source-based architectural research |
| [Yandex Adaptations](docs/yandex-adaptations.md) | Platform, offline-first, Windows, and security decisions |

## FAQ

**Do asset API keys have to be configured?** No. The local and procedural resolvers keep generation operational without Google, xAI, or Tripo3D.

**Is an NVIDIA GPU required?** No. Browser validation uses Chromium software WebGL compatibility mode by default.

**Why is a successful build not enough?** A valid bundle can still render a blank screen or fail at runtime. The factory requires browser evidence and visual validation.

**Can the generated game run without Docker or the factory?** Yes. Each project is an ordinary Vite application, and its `dist/` output is static HTML5 content.

**Where are screenshots and pipeline state stored?** Under the generated project's `.factory/` directory; they are excluded from production packages.

## License

No open-source license file is currently provided. Treat the repository as unlicensed unless the owner grants additional terms.
