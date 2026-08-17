import { describe, expect, it } from "vitest";

import { parseCreateGameInput, resolveProviderDefault } from "../../src/cli/prompts.js";

describe("parseCreateGameInput", () => {
  it("normalizes valid user input", () => {
    const result = parseCreateGameInput({
      name: "  Coin Runner  ",
      description: "  Collect coins and avoid obstacles.  ",
      type: "3d",
      quality: "LOW",
      provider: "auto",
    });

    expect(result).toEqual({
      name: "Coin Runner",
      description: "Collect coins and avoid obstacles.",
      type: "3d",
      quality: "LOW",
      provider: "auto",
    });
  });

  it("rejects short descriptions and unsupported options", () => {
    expect(() =>
      parseCreateGameInput({
        name: "X",
        description: "too short",
        type: "vr",
        quality: "ULTRA",
        provider: "unknown",
      }),
    ).toThrow("Invalid game configuration");
  });

  it("accepts codex-only as an explicit provider", () => {
    expect(() => parseCreateGameInput({
      name: "CRS Game",
      description: "Create a game through the CRS proxy.",
      type: "2d",
      quality: "MEDIUM",
      provider: "codex-only",
    })).not.toThrow();
  });

  it("uses AI_PROVIDER=codex-only as the interactive default", () => {
    expect(resolveProviderDefault("codex-only")).toBe("codex-only");
    expect(resolveProviderDefault("CODEX-ONLY")).toBe("codex-only");
    expect(resolveProviderDefault("unsupported")).toBe("auto");
  });
});
