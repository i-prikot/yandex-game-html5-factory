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

    await expect(createProvider("auto", { claude, codex })).resolves.toBe(claude);
    expect(codex.isAvailable).not.toHaveBeenCalled();
  });

  it("falls back to Codex in auto mode", async () => {
    const claude = mockProvider("claude", false);
    const codex = mockProvider("codex", true);

    await expect(createProvider("auto", { claude, codex })).resolves.toBe(codex);
  });

  it("does not change an explicit unavailable selection", async () => {
    const claude = mockProvider("claude", true);
    const codex = mockProvider("codex", false);

    await expect(createProvider("codex", { claude, codex })).rejects.toThrow("codex provider is unavailable");
    expect(claude.isAvailable).not.toHaveBeenCalled();
  });
});
