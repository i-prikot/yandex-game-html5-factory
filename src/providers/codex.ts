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
  ProviderRequestOptions,
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

interface CodexProviderOptions {
  command?: string;
  timeoutMs?: number;
  runner?: ProcessRunner;
}

export function extractAgentMessage(output: string): string {
  const lines = output.split(/\r?\n/u).filter(Boolean);
  let lastMessage = "";
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        item?: { type?: string; text?: string };
        message?: string;
      };
      if (event.item?.type === "agent_message" && event.item.text) {
        lastMessage = event.item.text;
      } else if (event.type === "message" && event.message) {
        lastMessage = event.message;
      }
    } catch {
      lastMessage = line;
    }
  }

  return lastMessage.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
}

export class CodexProvider implements IProvider {
  public readonly kind = "codex" as const;
  private readonly logger = createLogger("provider-codex");
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly runner: ProcessRunner;

  public constructor(options: CodexProviderOptions = {}) {
    this.command = options.command ?? process.env.CODEX_CLI_PATH ?? "codex";
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.runner = options.runner ?? runProcess;
  }

  public async isAvailable(): Promise<boolean> {
    this.logger.debug("Checking Codex availability", { command: this.command });
    try {
      const result = await this.runner(this.command, ["--version"], {
        cwd: process.cwd(),
        timeoutMs: 10_000,
      });
      return result.exitCode === 0;
    } catch (error) {
      this.logger.debug("Codex availability check failed", {
        reason: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async generateCode(
    prompt: string,
    context: ProviderContext,
    options: ProviderRequestOptions = {},
  ): Promise<CodeResponse> {
    return this.request(
      `${this.systemContext(context)}\n${prompt}\nReturn only JSON: {"code":"", "explanation":"", "files":[{"path":"", "content":""}]}.`,
      context,
      codeResponseSchema,
      undefined,
      options.timeoutMs,
    );
  }

  public async analyzeScreenshot(imageBase64: string, context: ProviderContext): Promise<AnalysisResponse> {
    const evidenceDirectory = join(context.projectPath, ".factory", "evidence");
    const imagePath = join(evidenceDirectory, "vision-input.png");
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(imagePath, Buffer.from(imageBase64, "base64"));

    try {
      return await this.request(
        `${this.systemContext(context)}\nInspect the attached game screenshot for blank rendering, missing objects, clipping, broken layout, and unreadable UI. Return only JSON: {"passed":true,"issues":[],"suggestions":[],"confidence":0.0}.`,
        context,
        analysisResponseSchema,
        imagePath,
      );
    } finally {
      await unlink(imagePath).catch(() => undefined);
    }
  }

  public async fixBug(code: string, error: string, context: ProviderContext): Promise<FixResponse> {
    return this.request(
      `${this.systemContext(context)}\nFix the reported game failure.\nError:\n${error}\nCurrent code:\n${code}\nReturn complete replacement files only as JSON: {"summary":"", "patches":[{"path":"", "content":""}]}.`,
      context,
      fixResponseSchema,
    );
  }

  private systemContext(context: ProviderContext): string {
    return `You are the ${context.role} role in a Yandex HTML5 game factory. Work only inside ${context.projectPath}. Do not include secrets, markdown fences, or commentary outside JSON.`;
  }

  private async request<T>(
    prompt: string,
    context: ProviderContext,
    schema: z.ZodType<T>,
    imagePath?: string,
    timeoutOverrideMs?: number,
  ): Promise<T> {
    if (!(await this.isAvailable())) {
      throw new ProviderUnavailableError(this.kind, `command '${this.command}' was not found or failed`);
    }

    const args = ["exec", "--json", "--sandbox", "workspace-write", "--skip-git-repo-check"];
    if (imagePath) {
      args.push("--image", imagePath);
    }
    args.push(prompt);

    const effectiveTimeoutMs = timeoutOverrideMs ?? this.timeoutMs;
    this.logger.info("Requesting Codex", {
      role: context.role,
      hasImage: Boolean(imagePath),
      timeoutMs: effectiveTimeoutMs,
    });
    const result = await this.runner(this.command, args, {
      cwd: context.projectPath,
      timeoutMs: effectiveTimeoutMs,
    });
    if (result.exitCode !== 0) {
      const error = new Error(`Codex exited with ${result.exitCode}: ${result.stderr.slice(-1_000)}`);
      this.logger.error("Codex request failed", error, { role: context.role });
      throw error;
    }

    try {
      const parsed = JSON.parse(extractAgentMessage(result.stdout)) as unknown;
      const response = schema.parse(parsed);
      this.logger.debug("Codex response validated", { role: context.role, stdoutBytes: result.stdout.length });
      return response;
    } catch (error) {
      throw new ProviderResponseError(this.kind, error instanceof Error ? error.message : String(error));
    }
  }
}
