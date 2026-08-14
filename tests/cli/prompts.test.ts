import { describe, expect, it } from "vitest";

import { parseCreateGameInput } from "../../src/cli/prompts.js";

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
});
