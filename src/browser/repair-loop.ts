import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { createLogger } from "../core/logger.js";
import type { IProvider } from "../providers/base.js";
import { runProcess, type ProcessRunner } from "../providers/process-runner.js";
import { BrowserTester, type BrowserTestResult } from "./tester.js";
import { VisualReviewer, type VisualReview } from "./reviewer.js";

export interface RepairIteration {
  iteration: number;
  buildPassed: boolean;
  review?: VisualReview;
  fixed: boolean;
  summary?: string;
}

export interface RepairLoopResult {
  passed: true;
  iterations: RepairIteration[];
  browserResult: BrowserTestResult;
  review: VisualReview;
}

export interface RepairLoopOptions {
  maxIterations?: number;
  buildRunner?: ProcessRunner;
  browserTester?: Pick<BrowserTester, "run">;
  reviewer?: Pick<VisualReviewer, "analyze">;
}

const logger = createLogger("repair-loop");

async function readRepairContext(projectPath: string): Promise<string> {
  const candidates = ["src/main.ts", "src/game.ts", "src/game2d.ts", "src/game3d.ts"];
  const files: string[] = [];
  for (const candidate of candidates) {
    try {
      files.push(`// FILE: ${candidate}\n${await readFile(resolve(projectPath, candidate), "utf8")}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return files.join("\n\n");
}

function safePatchPath(projectPath: string, patchPath: string): string {
  const projectRoot = resolve(projectPath);
  const target = resolve(projectRoot, patchPath);
  if (target === projectRoot || !target.startsWith(`${projectRoot}/`)) {
    throw new Error(`Provider patch escaped the game project: ${patchPath}`);
  }
  return target;
}

export class RepairLoopExhaustedError extends Error {
  public constructor(public readonly iterations: RepairIteration[]) {
    super(`Self-repair loop exhausted after ${iterations.length} iterations`);
    this.name = "RepairLoopExhaustedError";
  }
}

export class SelfRepairLoop {
  private readonly maxIterations: number;
  private readonly buildRunner: ProcessRunner;
  private readonly browserTester: Pick<BrowserTester, "run">;
  private readonly reviewer: Pick<VisualReviewer, "analyze">;

  public constructor(private readonly provider: IProvider, options: RepairLoopOptions = {}) {
    this.maxIterations = options.maxIterations ?? 5;
    this.buildRunner = options.buildRunner ?? runProcess;
    this.browserTester = options.browserTester ?? new BrowserTester();
    this.reviewer = options.reviewer ?? new VisualReviewer(provider);
    if (this.maxIterations < 1 || this.maxIterations > 5) {
      throw new Error("Self-repair maxIterations must be between 1 and 5");
    }
  }

  public async run(projectPathInput: string): Promise<RepairLoopResult> {
    const projectPath = resolve(projectPathInput);
    const iterations: RepairIteration[] = [];
    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      logger.info("Repair loop iteration", { iteration, maxIterations: this.maxIterations, projectPath });
      const build = await this.buildRunner("npm", ["run", "build"], { cwd: projectPath, timeoutMs: 180_000 });
      if (build.exitCode !== 0) {
        const failure = `Production build failed with exit code ${build.exitCode}\n${build.stderr.slice(-8_000)}`;
        const entry: RepairIteration = { iteration, buildPassed: false, fixed: false };
        iterations.push(entry);
        if (iteration === this.maxIterations) break;
        entry.summary = await this.requestAndApplyFix(projectPath, [failure]);
        entry.fixed = true;
        continue;
      }

      const browserResult = await this.browserTester.run(projectPath);
      const review = await this.reviewer.analyze(browserResult, projectPath);
      const entry: RepairIteration = { iteration, buildPassed: true, review, fixed: false };
      iterations.push(entry);
      if (review.passed) {
        logger.info("Self-repair validation passed", { projectPath, iteration, source: review.source });
        return { passed: true, iterations, browserResult, review };
      }
      if (iteration === this.maxIterations) break;
      const errors = [
        ...review.issues,
        ...browserResult.consoleErrors,
        ...browserResult.requestFailures,
        ...review.suggestions.map((suggestion) => `Suggestion: ${suggestion}`),
      ];
      entry.summary = await this.requestAndApplyFix(projectPath, errors);
      entry.fixed = true;
    }
    logger.error("Self-repair loop exhausted", new Error("Visual validation did not pass"), {
      projectPath,
      iterations: iterations.length,
    });
    throw new RepairLoopExhaustedError(iterations);
  }

  private async requestAndApplyFix(projectPath: string, errors: string[]): Promise<string> {
    const code = await readRepairContext(projectPath);
    logger.debug("Requesting repair patches", { projectPath, errors, codeBytes: code.length });
    const fix = await this.provider.fixBug(code, errors.join("\n"), {
      projectPath,
      role: "BugFixer",
      files: { "repair-context.ts": code },
      metadata: { errorCount: errors.length },
    });
    if (fix.patches.length === 0) throw new Error("BugFixer returned no replacement patches");
    for (const patch of fix.patches) {
      const target = safePatchPath(projectPath, patch.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, patch.content, "utf8");
      logger.debug("Repair patch applied", { file: relative(projectPath, target), bytes: patch.content.length });
    }
    logger.info("Repair patches applied", { projectPath, summary: fix.summary, patchCount: fix.patches.length });
    return fix.summary;
  }
}
