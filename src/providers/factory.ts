import { createLogger } from "../core/logger.js";
import type { IProvider } from "./base.js";
import { ProviderUnavailableError } from "./base.js";
import { ClaudeCodeProvider } from "./claude.js";
import { CodexOnlyProvider } from "./codex-only.js";
import { CodexProvider } from "./codex.js";

export type ProviderSelection = "auto" | "claude" | "codex" | "codex-only";

export interface ProviderCandidates {
  claude: IProvider;
  codex: IProvider;
  codexOnly: IProvider;
}

const logger = createLogger("provider-factory");

export async function createProvider(
  selection: ProviderSelection,
  candidates: ProviderCandidates = {
    claude: new ClaudeCodeProvider(),
    codex: new CodexProvider(),
    codexOnly: new CodexOnlyProvider(),
  },
): Promise<IProvider> {
  logger.info("Selecting host agent provider", { selection });

  if (selection === "codex-only") {
    const isAvailable = await candidates.codexOnly.isAvailable();
    logger.debug("Explicit provider availability checked", { provider: selection, isAvailable });
    if (!isAvailable) {
      throw new ProviderUnavailableError(
        selection,
        "CRS_OAI_KEY is not set or codex CLI is unavailable",
      );
    }
    logger.info("Host agent provider selected", { provider: candidates.codexOnly.kind });
    return candidates.codexOnly;
  }

  if (selection !== "auto") {
    const provider = candidates[selection];
    const isAvailable = await provider.isAvailable();
    logger.debug("Explicit provider availability checked", { provider: selection, isAvailable });
    if (!isAvailable) {
      throw new ProviderUnavailableError(selection, "the selected CLI is not installed or authenticated");
    }
    logger.info("Host agent provider selected", { provider: provider.kind });
    return provider;
  }

  for (const provider of [candidates.claude, candidates.codex]) {
    const isAvailable = await provider.isAvailable();
    logger.debug("Auto-selection candidate checked", { provider: provider.kind, isAvailable });
    if (isAvailable) {
      logger.info("Host agent provider selected", { provider: provider.kind });
      return provider;
    }
  }

  throw new ProviderUnavailableError(
    "codex",
    "neither Claude Code nor Codex CLI is available; install or authenticate one host agent",
  );
}
