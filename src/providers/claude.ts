import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { createLogger } from "../core/logger.js";
import type {
  AnalysisResponse,
  CodeResponse,
  FixResponse,
  IProvider,
  ProviderContext,
} from "./base.js";
import { ProviderResponseError, ProviderUnavailableError } from "./base.js";
import { runProcess, type ProcessRunner } from "./process-runner.js";

const codeResponseSchema = z.object({
  code: z.string(),
  explanation: z.string(),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
});
const analysisResponseSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
const fixResponseSchema = z.object({
  summary: z.string(),
  patches: z.array(z.object({ path: z.string(), content: z.string() })),
});

interface ClaudeProviderOptions {
  command?: string;
  timeoutMs?: number;
  runner?: ProcessRunner;
  sleep?: (milliseconds: number) => Promise<void>;
}

function extractJson(output: string): unknown {
  const envelope = JSON.parse(output) as unknown;
  if (typeof envelope === "object" && envelope !== null && "result" in envelope) {
    const result = (envelope as { result: unknown }).result;
    if (typeof result !== "string") {
      return result;
    }
    const cleaned = result.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
    return JSON.parse(cleaned);
  }
  return envelope;
}

export class ClaudeCodeProvider implements IProvider {
  public readonly kind = "claude" as const;
  private readonly logger = createLogger("provider-claude");
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly runner: ProcessRunner;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  public constructor(options: ClaudeProviderOptions = {}) {
    this.command = options.command ?? process.env.CLAUDE_CLI_PATH ?? "claude";
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.runner = options.runner ?? runProcess;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  public async isAvailable(): Promise<boolean> {
    this.logger.debug("Checking Claude Code availability", { command: this.command });
    try {
      const result = await this.runner(this.command, ["--version"], {
        cwd: process.cwd(),
        timeoutMs: 10_000,
      });
      return result.exitCode === 0;
    } catch (error) {
      this.logger.debug("Claude Code availability check failed", {
        reason: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async generateCode(prompt: string, context: ProviderContext): Promise<CodeResponse> {
    const response = await this.request(
      `${this.systemContext(context)}\n${prompt}\nReturn only JSON: {"code":"", "explanation":"", "files":[{"path":"", "content":""}]}.`,
      context,
    );
    return this.parse(response, codeResponseSchema);
  }

  public async analyzeScreenshot(imageBase64: string, context: ProviderContext): Promise<AnalysisResponse> {
    const evidenceDirectory = join(context.projectPath, ".factory", "evidence");
    const imagePath = join(evidenceDirectory, "vision-input.png");
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(imagePath, Buffer.from(imageBase64, "base64"));
    this.logger.debug("Prepared screenshot for Claude analysis", { imagePath });

    try {
      const response = await this.request(
        `${this.systemContext(context)}\nInspect the screenshot at ${imagePath}. Check for blank or black rendering, missing gameplay objects, clipping, broken layout, and unreadable UI. Return only JSON: {"passed":true,"issues":[],"suggestions":[],"confidence":0.0}.`,
        context,
      );
      return this.parse(response, analysisResponseSchema);
    } finally {
      await unlink(imagePath).catch(() => undefined);
    }
  }

  public async fixBug(code: string, error: string, context: ProviderContext): Promise<FixResponse> {
    const response = await this.request(
      `${this.systemContext(context)}\nFix the reported game failure.\nError:\n${error}\nCurrent code:\n${code}\nReturn complete replacement files only as JSON: {"summary":"", "patches":[{"path":"", "content":""}]}.`,
      context,
    );
    return this.parse(response, fixResponseSchema);
  }

  private systemContext(context: ProviderContext): string {
    return `You are the ${context.role} role in a Yandex HTML5 game factory. Work only inside ${context.projectPath}. Do not include secrets, markdown fences, or commentary outside JSON.`;
  }

  private async request(prompt: string, context: ProviderContext): Promise<string> {
    if (!(await this.isAvailable())) {
      throw new ProviderUnavailableError(this.kind, `command '${this.command}' was not found or failed`);
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      this.logger.info("Requesting Claude Code", { role: context.role, attempt, maxAttempts: 3 });
      try {
        const result = await this.runner(
          this.command,
          ["-p", prompt, "--output-format", "json", "--max-turns", "1"],
          { cwd: context.projectPath, timeoutMs: this.timeoutMs },
        );
        if (result.exitCode !== 0) {
          throw new Error(`Claude exited with ${result.exitCode}: ${result.stderr.slice(-1_000)}`);
        }
        this.logger.debug("Claude Code request completed", { role: context.role, stdoutBytes: result.stdout.length });
        return result.stdout;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          const delayMs = 500 * 2 ** (attempt - 1);
          this.logger.warn("Claude Code request failed; retrying", { attempt, delayMs, reason: String(error) });
          await this.sleep(delayMs);
        }
      }
    }

    this.logger.error("Claude Code request exhausted retries", lastError, { role: context.role });
    throw lastError;
  }

  private parse<T>(output: string, schema: z.ZodType<T>): T {
    try {
      return schema.parse(extractJson(output));
    } catch (error) {
      throw new ProviderResponseError(this.kind, error instanceof Error ? error.message : String(error));
    }
  }
}
