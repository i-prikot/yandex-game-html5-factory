export type ProviderKind = "claude" | "codex" | "codex-only";

export interface ProviderContext {
  projectPath: string;
  role: string;
  gameBrief?: string;
  files?: Readonly<Record<string, string>>;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface ProviderRequestOptions {
  timeoutMs?: number;
}

export interface CodeResponse {
  code: string;
  explanation: string;
  files: ReadonlyArray<{ path: string; content: string }>;
}

export interface AnalysisResponse {
  passed: boolean;
  issues: string[];
  suggestions: string[];
  confidence: number;
}

export interface FilePatch {
  path: string;
  content: string;
}

export interface FixResponse {
  summary: string;
  patches: FilePatch[];
}

export interface IProvider {
  readonly kind: ProviderKind;

  isAvailable(): Promise<boolean>;

  generateCode(
    prompt: string,
    context: ProviderContext,
    options?: ProviderRequestOptions,
  ): Promise<CodeResponse>;

  analyzeScreenshot(imageBase64: string, context: ProviderContext): Promise<AnalysisResponse>;

  fixBug(code: string, error: string, context: ProviderContext): Promise<FixResponse>;
}

export class ProviderUnavailableError extends Error {
  public constructor(provider: ProviderKind, reason: string) {
    super(`${provider} provider is unavailable: ${reason}`);
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderResponseError extends Error {
  public constructor(provider: ProviderKind, message: string) {
    super(`${provider} returned an invalid response: ${message}`);
    this.name = "ProviderResponseError";
  }
}
