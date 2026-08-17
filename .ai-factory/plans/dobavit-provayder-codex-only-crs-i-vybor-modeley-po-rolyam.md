<!-- handoff:task:56936591-d07e-401d-8646-3fad3176ce7e -->
# Add Codex-only (CRS) Provider and Role-based Model Selection

**Branch:** `feature/codex-only-crs-569365`
**Date:** 2026-08-17
**Mode:** full

## Settings

- [x] Testing: yes
- [x] Logging: verbose
- [x] Docs: yes

## Overview

Add a new `CodexOnlyProvider` (`kind = "codex-only"`) that runs the Codex CLI through a
CRS (Custom REST Service) OpenAI-compatible proxy. The API key is sourced exclusively from
`CRS_OAI_KEY` and injected into the child process environment via a dynamically written
`CODEX_HOME` config directory — never via CLI arguments. Per-role model selection uses
`CODEX_ONLY_MODEL_<ROLE>` env vars with `CODEX_ONLY_MODEL_DEFAULT` as fallback.
`codex-only` is NOT added to the auto-selection chain; it must be chosen explicitly.

---

## Section 1 — Prerequisites: Type System and ProcessRunner

- [x] *(prereq)* `src/providers/base.ts`: extend `ProviderKind` union to `"claude" | "codex" | "codex-only"`.
- [x] *(prereq)* `src/providers/process-runner.ts`: add optional `env?: NodeJS.ProcessEnv` to the options object type in the `ProcessRunner` function-type signature.
- [x] *(prereq)* `src/providers/process-runner.ts`: in `runProcess`, change the `spawn` call's `env` field from `process.env` to `options.env ?? process.env` (non-breaking — existing callers pass no `env`, default is unchanged).
- [x] *(prereq)* `src/providers/codex.ts`: change `function extractAgentMessage` to `export function extractAgentMessage` so `CodexOnlyProvider` can import it without duplicating JSONL-parsing logic.

---

## Section 2 — New file: src/providers/codex-only.ts

- [x] Create `src/providers/codex-only.ts`. Add imports: `mkdir`, `writeFile`, `unlink` from `"node:fs/promises"`; `os` from `"node:os"`; `path` from `"node:path"`; `z` from `"zod"`; `createLogger` from `"../core/logger.js"`; `IProvider`, `ProviderContext`, `AnalysisResponse`, `CodeResponse`, `FixResponse` from `"./base.js"`; `ProviderResponseError`, `ProviderUnavailableError` from `"./base.js"`; `runProcess`, `ProcessRunner` from `"./process-runner.js"`; `extractAgentMessage` from `"./codex.js"`. Copy the three Zod schemas (`codeResponseSchema`, `analysisResponseSchema`, `fixResponseSchema`) verbatim from `codex.ts`.
- [x] Define `interface CodexOnlyProviderOptions` with fields: `command?: string`, `timeoutMs?: number`, `runner?: ProcessRunner`, `codexHomePath?: string`.
- [x] Implement `export class CodexOnlyProvider implements IProvider` with: `public readonly kind = "codex-only" as const`; private logger `createLogger("provider-codex-only")`; private fields `command` (default `process.env.CODEX_CLI_PATH ?? "codex"`), `timeoutMs` (default `180_000`), `runner` (default `runProcess`), `codexHomePath` (default `path.join(os.tmpdir(), "codex-only-crs")`).
- [x] Implement `isAvailable(): Promise<boolean>`: run `this.runner(this.command, ["--version"], { cwd: process.cwd(), timeoutMs: 10_000 })` and check `exitCode === 0`; also check `!!process.env.CRS_OAI_KEY`. Return `false` with a DEBUG log on any failure. Do NOT log the key value.
- [x] Implement `private resolveModel(role: string): string`: return the documented role-specific `CODEX_ONLY_MODEL_*` value when non-empty; otherwise return `process.env.CODEX_ONLY_MODEL_DEFAULT ?? "gpt-5.6-luna"`. Log the resolved model name at DEBUG with the role name (not the key value).
- [x] Implement `private async prepareCodexHome(): Promise<void>`: call `await mkdir(this.codexHomePath, { recursive: true })`; write `config.toml` to `path.join(this.codexHomePath, "config.toml")` with the required Codex CLI TOML content that sets `env_key = "CRS_OAI_KEY"` for the OpenAI-compatible provider; write `auth.json` to `path.join(this.codexHomePath, "auth.json")` with content `JSON.stringify({ OPENAI_API_KEY: null }, null, 2)`. Log at DEBUG the prepared path (not the key).
- [x] Implement `private systemContext(context: ProviderContext): string` — body identical to `CodexProvider.systemContext`.
- [x] Implement `private async request<T>(prompt, context, schema, imagePath?)`: (1) `await this.prepareCodexHome()`; (2) throw `ProviderUnavailableError` if not available; (3) `resolveModel(context.role)`; (4) build args `["exec","--json","--sandbox","workspace-write","--skip-git-repo-check","--model", resolvedModel]`, append `["--image", imagePath]` when provided, append prompt last; (5) build `runnerEnv = { ...process.env, CODEX_HOME: this.codexHomePath, CRS_OAI_KEY: process.env.CRS_OAI_KEY ?? "" }`; (6) call `this.runner(this.command, args, { cwd: context.projectPath, timeoutMs: this.timeoutMs, env: runnerEnv })`; (7) on non-zero exit log ERROR and throw a plain `Error`; (8) parse with `extractAgentMessage` → `JSON.parse` → `schema.parse`, throw `ProviderResponseError` on failure; (9) log DEBUG `{ role, stdoutBytes }` on success.
- [x] Implement `generateCode`, `analyzeScreenshot`, and `fixBug` — same prompt templates and logic as `CodexProvider`. `analyzeScreenshot` writes image to `path.join(context.projectPath, ".factory", "evidence", "vision-input.png")` and deletes it in `finally`.

---

## Section 3 — Update src/providers/factory.ts

- [x] Extend `ProviderSelection` to `"auto" | "claude" | "codex" | "codex-only"`.
- [x] Add `codexOnly: IProvider` field to the `ProviderCandidates` interface.
- [x] Import `CodexOnlyProvider` from `"./codex-only.js"` and add `codexOnly: new CodexOnlyProvider()` to the default `candidates` object.
- [x] In `createProvider`, add handling for `selection === "codex-only"`: await `candidates.codexOnly.isAvailable()`; return the provider when available; throw `new ProviderUnavailableError("codex-only", "CRS_OAI_KEY is not set or codex CLI is unavailable")` otherwise. Do NOT add `codex-only` to the auto-selection chain.

---

## Section 4 — Update src/providers/index.ts

- [x] Add `export * from "./codex-only.js";` to `src/providers/index.ts`.

---

## Section 5 — Update src/cli/prompts.ts

- [x] Add `"codex-only"` to the `providerSchema` `z.enum([...])` call.
- [x] Add `{ name: "Codex only (CRS proxy)", value: "codex-only" as const }` to the interactive select choices array, after the existing `"codex"` entry.

---

## Section 6 — Update src/pipeline/orchestrator.ts

- [x] Add `"codex-only"` to the provider allowlist array in `FactoryPipeline.run` (the array currently contains `"auto"`, `"claude"`, `"codex"`).

---

## Section 7 — Update src/agents/build-manager.ts

- [x] Add `"CRS_OAI_KEY"` to the `SECRET_ENV_NAMES` array so `assertNoSecrets()` catches accidental inclusion of the key in generated `dist/` files and ZIP archives.

---

## Section 8 — Update .env.example

- [x] Append the following block to `.env.example`:
  ```
  CRS_OAI_KEY=
  CODEX_ONLY_MODEL_DEFAULT=gpt-5.6-luna
  CODEX_ONLY_MODEL_GAME_PLANNER=
  CODEX_ONLY_MODEL_GAMEPLAY_DEVELOPER=
  CODEX_ONLY_MODEL_BUG_FIXER=
  CODEX_ONLY_MODEL_VISUAL_REVIEWER=
  ```

---

## Section 9 — Update docker-compose.yml

- [x] Add the following entries to the `environment` section of `docker-compose.yml`:
  ```yaml
  CRS_OAI_KEY: ${CRS_OAI_KEY:-}
  CODEX_ONLY_MODEL_DEFAULT: ${CODEX_ONLY_MODEL_DEFAULT:-gpt-5.6-luna}
  CODEX_ONLY_MODEL_GAME_PLANNER: ${CODEX_ONLY_MODEL_GAME_PLANNER:-}
  CODEX_ONLY_MODEL_GAMEPLAY_DEVELOPER: ${CODEX_ONLY_MODEL_GAMEPLAY_DEVELOPER:-}
  CODEX_ONLY_MODEL_BUG_FIXER: ${CODEX_ONLY_MODEL_BUG_FIXER:-}
  CODEX_ONLY_MODEL_VISUAL_REVIEWER: ${CODEX_ONLY_MODEL_VISUAL_REVIEWER:-}
  ```
  Do NOT add a persistent named volume for `codex-only-config` — the CODEX_HOME directory is created fresh at runtime on each request.

---

## Section 10 — Unit tests: tests/providers/codex-only.test.ts

Create `tests/providers/codex-only.test.ts` using the same mock/spy pattern as `tests/providers/codex.test.ts`:

- [x] Test: `generateCode` produces an args array containing `"--model"` immediately followed by the resolved model string.
- [x] Test: when `CODEX_ONLY_MODEL_GAME_PLANNER` is set to a non-empty string, a request with `context.role = "GamePlanner"` uses that value as the model.
- [x] Test: `resolveModel` falls back to `CODEX_ONLY_MODEL_DEFAULT` (and ultimately to `"gpt-5.6-luna"`) when no role-specific env var is set.
- [x] Test: `isAvailable()` returns `false` when `CRS_OAI_KEY` is absent from the environment, even if the mock runner returns `exitCode === 0`.
- [x] Test: `isAvailable()` returns `true` when mock runner returns `exitCode === 0` AND `CRS_OAI_KEY` is a non-empty string.
- [x] Test: the args array passed to the runner contains no occurrence of the `CRS_OAI_KEY` value at any position.
- [x] Test: the `env` object passed to the runner contains `CODEX_HOME` equal to the configured `codexHomePath`.
- [x] Test: `prepareCodexHome()` writes both `config.toml` and `auth.json` inside `codexHomePath` before the runner is invoked (assert via `writeFile` mock or by checking fs state before runner callback).
- [x] Test: a valid JSONL fixture (same format as `codex.test.ts`) is parsed and returned as a correctly typed `CodeResponse`.
- [x] Test: `analyzeScreenshot` includes `--image <path>` in args and deletes the temp image in `finally` even when the runner throws.

---

## Section 11 — Update existing tests

- [x] `tests/providers/factory.test.ts`: add test — `createProvider("codex-only", candidates)` where `candidates.codexOnly.isAvailable()` resolves `true` returns `candidates.codexOnly`.
- [x] `tests/providers/factory.test.ts`: add test — `createProvider("codex-only", candidates)` where `candidates.codexOnly.isAvailable()` resolves `false` throws `ProviderUnavailableError`.
- [x] `tests/acceptance/providers.test.ts`: add acceptance case — `createProvider("codex-only", mockCandidates)` resolves to a provider with `kind === "codex-only"`.
- [x] `tests/cli/prompts.test.ts`: add test verifying that `parseCreateGameInput({ provider: "codex-only", ... })` passes `providerSchema` validation without throwing.

---

## Section 12 — Update README.md

- [x] In `README.md`, find the `AI_PROVIDER` env-var table row and append `codex-only` to its valid-values list with a parenthetical note that it requires `CRS_OAI_KEY`.
- [x] Add a new table row for `CRS_OAI_KEY`: describe it as the OpenAI-compatible API key for the CRS proxy, required when `AI_PROVIDER=codex-only`; note it is never embedded in generated source, Vite bundles, Docker images, or ZIP archives.
- [x] Add a table row for `CODEX_ONLY_MODEL_DEFAULT` (default: `gpt-5.6-luna`) — fallback model for the `codex-only` provider when no role-specific override is set.
- [x] Add table rows for `CODEX_ONLY_MODEL_GAME_PLANNER`, `CODEX_ONLY_MODEL_GAMEPLAY_DEVELOPER`, `CODEX_ONLY_MODEL_BUG_FIXER`, `CODEX_ONLY_MODEL_VISUAL_REVIEWER` — all optional, empty means the provider uses `CODEX_ONLY_MODEL_DEFAULT`.

---

## Commit Plan

- [x] **Commit 1 — Core types and provider** (after Sections 1–2):
  `feat(providers): add codex-only ProviderKind, ProcessRunner env, export extractAgentMessage, CodexOnlyProvider`

- [x] **Commit 2 — Integration wiring** (after Sections 3–9):
  `feat(providers): wire codex-only into factory, CLI, orchestrator, secret guard, env, Docker`

- [x] **Commit 3 — Tests** (after Sections 10–11):
  `test(providers): codex-only unit tests; update factory, acceptance, prompts tests`

- [x] **Commit 4 — Docs** (after Section 12):
  `docs: document codex-only provider and CRS env vars in README`

---

## Verification

- [x] Run `npm run typecheck` from project root — must complete with zero type errors.
- [x] Run `npm test` — all suites must pass, including the new `tests/providers/codex-only.test.ts`.
- [x] Manual smoke: `AI_PROVIDER=codex-only CRS_OAI_KEY=<key> npm run cli` — CLI must accept `codex-only` as a valid provider choice and attempt to invoke `CodexOnlyProvider`.
- [x] Secret guard: run `npm run build`; confirm `BuildManager.assertNoSecrets()` would flag any accidental inclusion of `CRS_OAI_KEY` value in `dist/` output (verified by the addition to `SECRET_ENV_NAMES`).

---

## Rework — 2026-08-17 Runtime Response Handling

- [x] `src/agents/gameplay-developer.ts`: ignore empty `files` entries and fall back to the non-empty `code` field so a valid Codex response is not rejected as “returned no source code”.
- [x] `src/agents/game-planner.ts`: constrain and normalize AI asset types to the supported asset-pipeline vocabulary instead of discarding an otherwise valid plan.
- [x] Add focused regression coverage for the empty-file gameplay response and Codex asset-type aliases observed during the CLI run.
- [x] Run focused tests, `npm run typecheck`, and `npm test`.

---

## Rework — 2026-08-17 Codex Vision Stdin and Production SDK

- [x] `src/providers/process-runner.ts` and `src/providers/codex-only.ts`: pipe Codex-only prompts through stdin so variadic `--image` arguments cannot consume the prompt.
- [x] `src/agents/build-manager.ts`: restore the mandatory Yandex Games SDK v2 script in built `dist/index.html` before validation and packaging.
- [x] Add focused regression coverage for ProcessRunner stdin, Codex-only screenshot prompts, and production SDK restoration.
- [x] Run focused tests, `npm run typecheck`, and `npm test`.

---

## Rework — 2026-08-17 CRS Base URL

- [x] `src/providers/codex-only.ts`: use the specified CRS endpoint `https://5x.gptclaudegemini.xyz/` and update the focused config test.

---

## Rework — 2026-08-17 Documented Default Model

- [x] `src/providers/codex-only.ts`: restore `gpt-5.6-luna` as both the generated Codex configuration model and the built-in role-selection fallback; update the focused fallback assertion.
