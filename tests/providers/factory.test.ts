import { describe, expect, it, vi } from "vitest";

import type { IProvider, ProviderKind } from "../../src/providers/base.js";
import { createProvider } from "../../src/providers/factory.js";

function mockProvider(kind: ProviderKind, isAvailable: boolean): IProvider {
  return {
    kind,
    isAvailable: vi.fn(async () => isAvailable),
    generateCode: vi.fn(),
    analyzeScreenshot: vi.fn(),
    fixBug: vi.fn(),
  };
}

describe("createProvider", () => {
  it("prefers Claude when both providers are available", async () => {
    const claude = mockProvider("claude", true);
    const codex = mockProvider("codex", true);
    const codexOnly = mockProvider("codex-only", true);

    await expect(createProvider("auto", { claude, codex, codexOnly })).resolves.toBe(claude);
    expect(codex.isAvailable).not.toHaveBeenCalled();
    expect(codexOnly.isAvailable).not.toHaveBeenCalled();
  });

  it("falls back to Codex in auto mode", async () => {
    const claude = mockProvider("claude", false);
    const codex = mockProvider("codex", true);
    const codexOnly = mockProvider("codex-only", true);

    await expect(createProvider("auto", { claude, codex, codexOnly })).resolves.toBe(codex);
    expect(codexOnly.isAvailable).not.toHaveBeenCalled();
  });

  it("does not change an explicit unavailable selection", async () => {
    const claude = mockProvider("claude", true);
    const codex = mockProvider("codex", false);
    const codexOnly = mockProvider("codex-only", true);

    await expect(createProvider("codex", { claude, codex, codexOnly })).rejects.toThrow("codex provider is unavailable");
    expect(claude.isAvailable).not.toHaveBeenCalled();
  });

  it("returns an available explicit Codex-only provider", async () => {
    const claude = mockProvider("claude", false);
    const codex = mockProvider("codex", false);
    const codexOnly = mockProvider("codex-only", true);

    await expect(createProvider("codex-only", { claude, codex, codexOnly })).resolves.toBe(codexOnly);
  });

  it("rejects an unavailable explicit Codex-only provider", async () => {
    const claude = mockProvider("claude", true);
    const codex = mockProvider("codex", true);
    const codexOnly = mockProvider("codex-only", false);

    await expect(createProvider("codex-only", { claude, codex, codexOnly }))
      .rejects.toThrow("codex-only provider is unavailable");
    expect(claude.isAvailable).not.toHaveBeenCalled();
    expect(codex.isAvailable).not.toHaveBeenCalled();
  });
});
