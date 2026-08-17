<!-- handoff:task:4f4de3ca-eff6-456d-b096-b7b7ec83cf38 -->
# Implementation Plan: Incremental Code Generation to Eliminate Timeout

**Branch:** `feature/timeout-4f4de3`
**Created:** 2026-08-17
**Status:** Ready for implementation

## Problem Summary

The Codex agent currently times out after 300000ms (5 minutes) when generating game code in the `gameplay` stage. The agent receives the entire game plan in one prompt and attempts to generate all gameplay code in a single request, which exceeds the execution time limit.

**Error:**
```
Error: codex timed out after 300000ms
    at Timeout.<anonymous> (/app/src/providers/process-runner.ts:30:16)
```

The root cause is that `GameplayDeveloper.writeCode()` makes one large `generateCode()` call that generates the entire game implementation synchronously, causing the provider process to exceed its timeout threshold.

## Solution Strategy

Redesign the code generation pipeline to work in **incremental phases**, where the agent writes code in smaller, focused chunks instead of generating everything at once. Each phase will:

1. Have a clear, narrow scope (e.g., "setup scene", "player controls", "game logic")
2. Be validated independently before proceeding
3. Stay well within timeout limits (~60-90 seconds per phase)
4. Build incrementally on previous phases

This approach mirrors how human developers work: scaffold → implement core → add features → polish.

## Settings

- [ ] **Testing:** Yes - comprehensive tests for phased generation
- [ ] **Logging:** Verbose - detailed phase transition and timing logs
- [ ] **Documentation:** Yes - document the phased generation architecture
- [ ] **Roadmap Linkage:** None (tactical improvement)

## Architecture Context

From `.ai-factory/ARCHITECTURE.md`:

- [ ] **Pipeline:** `FactoryPipeline` orchestrates agent stages (planning → architecture → assets → **gameplay** → validation → build)
- [ ] **Provider abstraction:** `IProvider` interface supports `CodexProvider`, `CodexOnlyProvider`, and `ClaudeProvider`
- [ ] **Current gameplay flow:** `GameplayDeveloper.writeCode()` → single `provider.generateCode()` call → timeout
- [ ] **Tech stack:** Node.js, TypeScript, Babylon.js for 3D, procedural fallbacks

The timeout occurs in the `gameplay` stage, after planning and scaffolding complete successfully.

## Tasks

### Phase 1: Design Phase System

- [x] **Task 1.1: Define phase contract interface**
  - [x] Create `src/agents/gameplay-phases.ts` with phase definitions
  - [x] Define `GameplayPhase` interface: `{ name: string, scope: string, dependencies: string[], estimatedTimeMs: number }`
  - [x] Create phase sequence for 2D games: `["scaffold", "player-movement", "game-logic", "ui-integration"]`
  - [x] Create phase sequence for 3D games: `["scene-setup", "camera-controls", "player-entity", "game-mechanics", "optimization"]`
  - [x] Add validation: each phase scope must be under 2000 characters, estimated time under 90000ms
  - [x] **Files:** `src/agents/gameplay-phases.ts` (new)
  - [x] **Logging:** `DEBUG` when phases are resolved, `INFO` for phase count and total estimated time

- [x] **Task 1.2: Create phase orchestrator**
  - [x] Create `PhaseOrchestrator` class in `src/agents/phase-orchestrator.ts`
  - [x] Implement `executePhases(phases: GameplayPhase[], plan: GamePlan, projectPath: string, provider: IProvider): Promise<PhaseExecutionResult>`
  - [x] Track phase execution state: current phase, completed phases, accumulated code
  - [x] Add timeout safety: fail fast if any phase exceeds 120000ms (2 minutes)
  - [x] Implement rollback on phase failure: preserve last working state
  - [x] **Files:** `src/agents/phase-orchestrator.ts` (new)
  - [x] **Logging:** `INFO` at phase start/completion, `WARN` on phase timeout, `ERROR` on phase failure
  - [x] **Tests:** Unit test for phase state management, timeout handling, rollback behavior

- [x] **Task 1.3: Extract phase prompt builder**
  - [x] Create `src/agents/phase-prompts.ts` with phase-specific prompt templates
  - [x] Implement `buildPhasePrompt(phase: GameplayPhase, plan: GamePlan, previousCode: string): string`
  - [x] Templates must include: phase scope, game context (type/genre/quality), dependencies on previous phases
  - [x] Add constraint injection: "Generate only code for {phase.name}. Do not implement {nextPhase.name}."
  - [x] Keep prompts concise: max 1500 characters per phase to reduce LLM processing time
  - [x] **Files:** `src/agents/phase-prompts.ts` (new)
  - [x] **Logging:** `DEBUG` log prompt size for each phase
  - [x] **Tests:** Unit test prompt generation for each 2D/3D phase, validate size limits

**Blocked by:** None

---

### Phase 2: Integrate Phased Generation into GameplayDeveloper

- [x] **Task 2.1: Refactor GameplayDeveloper to use phases**
  - [x] Modify `src/agents/gameplay-developer.ts` to detect game type and select phase sequence
  - [x] Replace single `provider.generateCode()` call with `PhaseOrchestrator.executePhases()`
  - [x] Accumulate code across phases: start with scaffold template, merge each phase's output
  - [x] Add phase manifest: write `.factory/gameplay-phases.json` with phase timings and status
  - [x] Preserve existing interface: `writeCode(plan, projectPath)` signature unchanged for compatibility
  - [x] **Files:** `src/agents/gameplay-developer.ts` (modify)
  - [x] **Logging:** `INFO` log phase transition ("Starting phase 2/5: player-movement"), `DEBUG` log code merge operations
  - [x] **Tests:** Integration test: mock provider, verify phases execute in order, check accumulated output

- [x] **Task 2.2: Add phase validation checkpoints**
  - [x] After each phase, validate TypeScript syntax with `tsc --noEmit` on partial code
  - [x] If validation fails, retry phase once with error feedback before failing
  - [x] Log validation timing: should be under 5000ms per checkpoint
  - [x] Write validation results to `.factory/phase-validation.json`
  - [x] **Files:** `src/agents/gameplay-developer.ts` (modify), `src/agents/phase-orchestrator.ts` (modify)
  - [x] **Logging:** `INFO` for validation pass, `WARN` for validation failure + retry, `ERROR` for validation exhaustion
  - [x] **Tests:** Unit test TypeScript validation logic, test retry on syntax error

- [x] **Task 2.3: Implement incremental file writing**
  - [x] Instead of writing the full game file at the end, write after each phase completes
  - [x] Enable hot-reload friendly incremental updates: developer can see progress in real-time
  - [x] Create backup before each write: `.factory/backups/{phase-name}-{timestamp}.ts`
  - [x] On final phase completion, clean up backups older than 24 hours
  - [x] **Files:** `src/agents/gameplay-developer.ts` (modify)
  - [x] **Logging:** `DEBUG` log each incremental write, `INFO` log backup cleanup
  - [x] **Tests:** Test incremental writes create valid files, test backup creation/cleanup

**Blocked by:** Task 1.1, Task 1.2, Task 1.3

---

### Phase 3: Provider Timeout Configuration

- [x] **Task 3.1: Add per-phase timeout configuration**
  - [x] Modify `src/providers/codex.ts` and `src/providers/codex-only.ts` to accept per-request timeout override
  - [x] Change `generateCode()` signature: add optional `timeoutMs` parameter
  - [x] Update `CodexProvider` and `CodexOnlyProvider` to pass timeout to `runProcess`
  - [x] Default remains 180000ms (3 minutes) for backward compatibility, but phases use 90000ms (1.5 minutes)
  - [x] **Files:** `src/providers/codex.ts` (modify), `src/providers/codex-only.ts` (modify), `src/providers/base.ts` (modify interface)
  - [x] **Logging:** `DEBUG` log effective timeout for each request
  - [x] **Tests:** Unit test timeout override in both providers

- [x] **Task 3.2: Add timeout monitoring and early warnings**
  - [x] Track elapsed time per phase in `PhaseOrchestrator`
  - [x] If a phase exceeds 75% of its timeout budget, log `WARN` with phase name and elapsed time
  - [x] Emit progress events: `onPhaseProgress(phase, elapsedMs, timeoutMs)` for CLI feedback
  - [x] Add timeout metrics to pipeline manifest: `.factory/pipeline-result.json` includes `phaseTimings`
  - [x] **Files:** `src/agents/phase-orchestrator.ts` (modify), `src/pipeline/orchestrator.ts` (modify)
  - [x] **Logging:** `WARN` at 75% timeout threshold, `INFO` at phase completion with timing
  - [x] **Tests:** Test timeout warning triggers at correct threshold

**Blocked by:** Task 2.1

---

### Phase 4: Pipeline Integration and Error Handling

- [x] **Task 4.1: Update FactoryPipeline to handle phase failures**
  - [x] Modify `src/pipeline/orchestrator.ts` to catch phase-specific errors
  - [x] Add new progress substages: `gameplay-phase-1`, `gameplay-phase-2`, etc.
  - [x] On phase failure, write detailed error to `.factory/phase-failure.json`: phase name, error, code snapshot
  - [x] Preserve partial progress: even if phase 4/5 fails, phases 1-3 code is saved
  - [x] **Files:** `src/pipeline/orchestrator.ts` (modify)
  - [x] **Logging:** `INFO` for each phase substage, `ERROR` with phase context on failure
  - [x] **Tests:** Integration test: simulate phase failure, verify partial code preservation

- [x] **Task 4.2: Add phase resume capability (stretch goal)**
  - [x] If pipeline fails mid-phase, allow resume from last completed phase
  - [x] Read `.factory/gameplay-phases.json` to detect completed phases
  - [x] Skip completed phases and continue from failure point
  - [x] Add CLI flag: `--resume-from-phase <phase-name>` (future enhancement, document for now)
  - [x] **Files:** `src/agents/phase-orchestrator.ts` (modify), document in code comments
  - [x] **Logging:** `INFO` when resuming, list skipped phases
  - [x] **Tests:** Manual test (acceptance test candidate for future)

**Blocked by:** Task 2.1, Task 2.2

---

### Phase 5: Testing and Validation

- [x] **Task 5.1: Add acceptance test for phased generation**
  - [x] Create `tests/acceptance/phased-gameplay.test.ts`
  - [x] Test scenario: generate 3D game with mocked provider, verify all phases execute without timeout
  - [x] Mock provider returns minimal valid code for each phase
  - [x] Assert: total execution time < 300000ms, all phases complete, final game file is valid TypeScript
  - [x] **Files:** `tests/acceptance/phased-gameplay.test.ts` (new)
  - [x] **Logging:** Test logs phase timings
  - [x] **Blocked by:** Task 2.1, Task 4.1

- [x] **Task 5.2: Add unit tests for phase system**
  - [x] Test `gameplay-phases.ts`: phase validation, sequence generation for 2D/3D
  - [x] Test `phase-orchestrator.ts`: phase execution order, rollback, timeout handling
  - [x] Test `phase-prompts.ts`: prompt generation, size limits, constraint injection
  - [x] Achieve >80% code coverage for new modules
  - [x] **Files:** `tests/agents/gameplay-phases.test.ts` (new), `tests/agents/phase-orchestrator.test.ts` (new), `tests/agents/phase-prompts.test.ts` (new)
  - [x] **Logging:** Test runner logs
  - [x] **Blocked by:** Task 1.1, Task 1.2, Task 1.3

- [x] **Task 5.3: Regression test - verify existing games still work**
  - [x] Run existing acceptance tests with phased generation enabled
  - [x] Test 2D game generation: `tests/acceptance/2d-game-no-api-keys.test.ts`
  - [x] Test 3D game generation: `tests/acceptance/3d-game-no-api-keys.test.ts`
  - [x] Assert: games still build successfully, visual validation passes, no regressions
  - [x] **Files:** Existing test files (no modification)
  - [x] **Logging:** Standard test logs
  - [x] **Blocked by:** Task 2.1, Task 4.1

**Blocked by:** Task 2.1, Task 2.2, Task 4.1

---

### Phase 6: Documentation and Monitoring

- [ ] **Task 6.1: Document phased generation architecture**
  - [ ] Update `.ai-factory/ARCHITECTURE.md` with new "Phased Code Generation" section
  - [ ] Document phase sequences for 2D and 3D games
  - [ ] Explain phase orchestration flow: phase selection → prompt building → execution → validation → merge
  - [ ] Add troubleshooting: "If a phase times out, check `.factory/phase-failure.json`"
  - [ ] **Files:** `.ai-factory/ARCHITECTURE.md` (modify)
  - [ ] **Logging:** N/A
  - [ ] **Blocked by:** Task 2.1

- [ ] **Task 6.2: Add phase timing metrics to CLI output**
  - [ ] Modify `src/cli/index.ts` to display phase progress during gameplay stage
  - [ ] Show: "Phase 2/5: player-movement (45s / 90s budget)"
  - [ ] On completion, show total phase breakdown: "Phase timings: scaffold=15s, player-movement=45s, ..."
  - [ ] Add visual progress bar (optional, use simple text for MVP)
  - [ ] **Files:** `src/cli/index.ts` (modify)
  - [ ] **Logging:** CLI output only (not file logs)
  - [ ] **Blocked by:** Task 3.2, Task 4.1

- [ ] **Task 6.3: Update README with timeout improvements**
  - [ ] Add section: "How We Eliminated Timeouts" explaining phased generation
  - [ ] Document environment variable: `CODEX_ONLY_TIMEOUT_MS` (already exists, but clarify phase usage)
  - [ ] Explain that each phase has its own 90s budget, total can be 5-7 minutes for complex games
  - [ ] Add FAQ: "What if a single phase still times out?" → Answer: reduce phase scope or increase timeout
  - [ ] **Files:** `README.md` (modify)
  - [ ] **Logging:** N/A
  - [ ] **Blocked by:** Task 2.1

**Blocked by:** Task 2.1, Task 3.2, Task 4.1

---

## Commit Plan

**Checkpoint 1** (After Phase 1 - Task 1.1, 1.2, 1.3):
```
feat(gameplay): introduce phased code generation system

- [x] Add GameplayPhase interface and phase sequences
- [x] Implement PhaseOrchestrator for incremental execution
- [x] Create phase-specific prompt builder
- [x] Add comprehensive logging and validation
```

**Checkpoint 2** (After Phase 2 - Task 2.1, 2.2, 2.3):
```
refactor(gameplay): integrate phased generation into GameplayDeveloper

- [x] Replace single monolithic code generation with phase execution
- [x] Add phase validation checkpoints with TypeScript syntax checks
- [x] Implement incremental file writing with backups
- [x] Preserve backward compatibility
```

**Checkpoint 3** (After Phase 3 - Task 3.1, 3.2):
```
feat(providers): add per-phase timeout configuration

- [x] Add timeoutMs parameter to generateCode() interface
- [x] Implement timeout monitoring and early warnings
- [x] Emit progress events for CLI feedback
- [x] Add timeout metrics to pipeline manifest
```

**Checkpoint 4** (After Phase 4 - Task 4.1, 4.2):
```
feat(pipeline): integrate phased gameplay into pipeline orchestrator

- [x] Add phase-specific progress substages
- [x] Implement detailed phase failure reporting
- [x] Preserve partial progress on failure
- [x] Document phase resume capability
```

**Checkpoint 5** (After Phase 5 - Task 5.1, 5.2, 5.3):
```
test(gameplay): comprehensive tests for phased generation

- [x] Add acceptance test for phased gameplay
- [x] Add unit tests for phase system components
- [x] Verify no regressions in existing game generation
```

**Checkpoint 6** (After Phase 6 - Task 6.1, 6.2, 6.3):
```
docs(gameplay): document phased generation architecture

- [ ] Update ARCHITECTURE.md with phased generation flow
- [ ] Add phase timing metrics to CLI output
- [ ] Update README with timeout improvements
```

---

## Implementation Notes

### Key Design Decisions

1. **Phase Granularity:** Phases are scoped to 60-90 seconds each to stay well below the 300s timeout while allowing meaningful work.

2. **Incremental Validation:** TypeScript syntax checks after each phase catch errors early, reducing wasted time in later phases.

3. **Backward Compatibility:** The `GameplayDeveloper.writeCode()` interface remains unchanged; phasing is an internal implementation detail.

4. **Fault Tolerance:** Each phase is self-contained; failure in phase 4/5 doesn't lose work from phases 1-3.

5. **Observability:** Comprehensive logging and metrics (phase timings, timeout warnings, validation results) make debugging easier.

### Performance Expectations

- [ ] **Current:** Single 300s+ timeout in gameplay stage
- [ ] **Target:** 4-5 phases × 60-90s each = 240-450s total, but with progress feedback and no single-point timeout failure
- [ ] **Each phase budget:** 90s (1.5 minutes) with 120s hard timeout
- [ ] **Total gameplay stage:** 5-7 minutes for complex games, 3-4 minutes for simple games

### Risks and Mitigations

**Risk 1:** Phase boundaries might not align with natural code structure
**Mitigation:** Phase sequences are game-type specific (2D vs 3D); adjust in testing if needed

**Risk 2:** Merging code across phases might introduce inconsistencies
**Mitigation:** Each phase receives previous code in prompt context; TypeScript validation catches breaks

**Risk 3:** Total time might still exceed limits for very complex games
**Mitigation:** Phase orchestrator supports dynamic timeout extension via env var; document in README

---

## Next Steps

1. Review this plan with the team
2. Start implementation with Phase 1 (design phase system)
3. After Phase 2, test with real game generation to validate approach
4. Adjust phase sequences based on empirical timing data
5. Complete testing and documentation phases

---

## Success Criteria

- [ ] No more "codex timed out after 300000ms" errors in gameplay stage
- [ ] All acceptance tests pass with phased generation
- [ ] Phase timing metrics visible in CLI output
- [ ] Documentation updated with new architecture
- [ ] Backward compatibility maintained (existing API unchanged)

---

**Ready for implementation:** `/aif-implement`
