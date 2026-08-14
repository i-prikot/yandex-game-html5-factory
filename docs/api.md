[← Architecture Deep Dive](architecture-deep-dive.md) · [Back to README](../README.md) · [Game Templates →](templates-guide.md)

# TypeScript API Reference

The factory currently exposes TypeScript modules directly from `src/`; it is not published as an npm library. Internal consumers should use `.js` import suffixes because the project compiles with NodeNext module resolution.

## Pipeline API

### `FactoryPipeline.run()`

```ts
run(
  prompt: string,
  quality: string,
  providerSelection: string,
  options?: {
    title?: string;
    type?: "auto" | "2d" | "3d";
    onProgress?: (event: PipelineProgress) => void;
  },
): Promise<FactoryPipelineResult>
```

The orchestrator selects a provider, plans the game, scaffolds it, resolves assets, generates gameplay, completes visual repair, and creates the Yandex ZIP.

```ts
import { FactoryPipeline } from "./src/pipeline/orchestrator.js";

const result = await new FactoryPipeline().run(
  "A native 2D puzzle with ten short levels",
  "LOW",
  "auto",
  {
    title: "Signal Tiles",
    type: "2d",
    onProgress: ({ stage, status, message }) => {
      console.log(stage, status, message);
    },
  },
);

console.log(result.production.packagePath);
```

`FactoryPipelineResult` includes the `GamePlan`, project path, asset report, browser/visual validation evidence, provider name, and `ProductionPackage`.

## Agent APIs

| Agent | Constructor | Public operation | Result |
| --- | --- | --- | --- |
| `GamePlanner` | `new GamePlanner(provider)` | `analyze(prompt, quality, hints?)` | `Promise<GamePlan>` |
| `GameArchitect` | `new GameArchitect(generator?, options?)` | `scaffold(plan)` | Generated project path |
| `GameplayDeveloper` | `new GameplayDeveloper(provider)` | `writeCode(plan, projectPath)` | Written files and explanation |
| `BugFixer` | `new BugFixer(provider)` | `fix(projectPath, issues, consoleErrors)` | Applied `FixResponse` |
| `BuildManager` | `new BuildManager(options?)` | `buildForYandex(projectPath)` | `ProductionPackage` |

### `GamePlan`

```ts
interface GamePlan {
  title: string;
  description: string;
  type: "2d" | "3d";
  genre: string;
  mechanics: string[];
  assets: AssetRequest[];
  quality: "LOW" | "MEDIUM" | "HIGH";
}
```

`GamePlanner.analyze()` validates provider JSON with Zod. Invalid or unavailable AI output falls back to a deterministic planner, but the selected host CLI must still be available for gameplay generation.

### Architecture and generation

`GameArchitect.scaffold()` creates a collision-safe slug under `projects/`, copies the native 2D template or Babylon base plus a 3D overlay, installs dependencies, injects a performance budget for 3D, and records `.factory/game-plan.json`.

`GameplayDeveloper.writeCode()` permits complete `.ts` or `.css` replacements only inside the generated `src/` directory. `BugFixer.fix()` rejects patches outside the project and refuses edits under `node_modules/` or `dist/`.

### Production packaging

```ts
const manager = new BuildManager({ outputRoot: "output" });
const production = await manager.buildForYandex("projects/signal-tiles");
```

`buildForYandex()` runs the game build, requires the Yandex SDK v2 script, scans text output for configured secret values, and writes `output/packages/<slug>.zip`.

## Provider API

Both `ClaudeCodeProvider` and `CodexProvider` implement `IProvider`:

```ts
interface IProvider {
  readonly kind: "claude" | "codex";
  isAvailable(): Promise<boolean>;
  generateCode(prompt: string, context: ProviderContext): Promise<CodeResponse>;
  analyzeScreenshot(imageBase64: string, context: ProviderContext): Promise<AnalysisResponse>;
  fixBug(code: string, error: string, context: ProviderContext): Promise<FixResponse>;
}
```

`ProviderContext` always contains `projectPath` and a logical `role`; it may also carry the brief, source files, and scalar metadata. Provider responses are validated before the pipeline uses them.

### Selection

```ts
import { createProvider } from "./src/providers/factory.js";

const provider = await createProvider("auto");
```

`auto` checks Claude Code first, then Codex. Explicit selection fails with `ProviderUnavailableError` when that CLI is not installed or authenticated. `ClaudeCodeProvider` retries failed requests three times; `CodexProvider` parses JSON Lines output from `codex exec --json`.

### Custom provider

Implement all four operations and return structured data. Do not return markdown fences or write outside `context.projectPath`.

```ts
import type { IProvider } from "./src/providers/base.js";

const provider: IProvider = {
  kind: "codex",
  async isAvailable() { return true; },
  async generateCode() {
    return { code: "", explanation: "", files: [] };
  },
  async analyzeScreenshot() {
    return { passed: true, issues: [], suggestions: [], confidence: 0.9 };
  },
  async fixBug() {
    return { summary: "No changes", patches: [] };
  },
};
```

Production generation normally requires non-empty code and repair patches. The minimal provider above is suitable only as a test double.

## Asset Pipeline API

```ts
interface AssetRequest {
  type: "3d-model" | "texture" | "sprite" | "audio" | "ui";
  name: string;
  description: string;
  tags: string[];
}

interface AssetResolver {
  readonly source: "ai" | "local" | "procedural";
  resolve(request: AssetRequest, projectPath: string): Promise<ResolvedAsset | null>;
}
```

`createAssetManager()` configures this order:

```text
AiAssetGenerator -> LocalAssetLibrary -> ProceduralAssetResolver
```

Failure or `null` at one level continues to the next. `resolveAssets()` returns every result plus `fallbackCount`, the number of procedural resolutions.

### Custom resolver

```ts
import { AssetManager } from "./src/asset-pipeline/manager.js";
import { ProceduralAssetResolver } from "./src/asset-pipeline/procedural.js";
import type { AssetResolver } from "./src/asset-pipeline/types.js";

const studioLibrary: AssetResolver = {
  source: "local",
  async resolve(request, projectPath) {
    // Return a licensed ResolvedAsset or null when there is no match.
    return null;
  },
};

const assets = new AssetManager([
  studioLibrary,
  new ProceduralAssetResolver(),
]);
```

Every successful result must include provenance in `license` and `metadata`. Keep the procedural resolver last so an unavailable external service cannot stop generation.

## Browser and Repair APIs

| API | Operation | Important output |
| --- | --- | --- |
| `BrowserTester` | `run(projectPath)` | Screenshot, console errors, failed requests, runtime metrics |
| `VisualReviewer` | `analyze(browserResult, projectPath)` | Local pixel evidence plus optional provider review |
| `SelfRepairLoop` | `run(projectPath)` | Successful evidence and all repair iterations |

`SelfRepairLoop` accepts injected build, browser, and reviewer dependencies for deterministic testing. `maxIterations` must be between 1 and 5; exhaustion throws `RepairLoopExhaustedError`.

## Performance API

`QUALITY_PRESETS`, `resolveQualityPreset()`, and `getPerformanceBudget()` expose factory budgets. `applyBudget(code, selection)` uses the TypeScript syntax tree to inject bounded Babylon engine and scene settings while preserving source code.

Generated Babylon games use `RuntimePerformanceMonitor`, which exposes `onFrame()`, `recordFps()`, and `getQuality()`. Runtime downgrades change hardware scaling and publish metrics through `window.__GAME_METRICS__`.

## Errors and Logging

Expected domain errors include `ProviderUnavailableError`, `ProviderResponseError`, `AssetResolutionError`, and `RepairLoopExhaustedError`. Factory logs are structured JSON and filtered with `LOG_LEVEL=debug|info|warn|error|silent`.

## See Also

- [Architecture Deep Dive](architecture-deep-dive.md) — ownership boundaries and pipeline flow
- [Game Templates](templates-guide.md) — generated project contracts
- [Performance Guide](performance-guide.md) — budget values and runtime adaptation
