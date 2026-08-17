import { describe, expect, it, vi } from "vitest";

import { GamePlanner } from "../../src/agents/game-planner.js";
import type { IProvider } from "../../src/providers/base.js";

describe("GamePlanner", () => {
  it("validates the provider plan and respects explicit user hints", async () => {
    const provider = {
      kind: "claude",
      generateCode: vi.fn(async () => ({
        code: JSON.stringify({
          title: "Agent title",
          type: "3d",
          genre: "racing",
          mechanics: ["drive", "collect"],
          assets: [{ type: "3d-model", name: "car", description: "low-poly car", tags: ["car"] }],
          quality: "HIGH",
        }),
        explanation: "planned",
        files: [],
      })),
    } as unknown as IProvider;

    const plan = await new GamePlanner(provider).analyze("A small racing game", "LOW", { title: "My Racer", type: "3d" });

    expect(plan).toMatchObject({ title: "My Racer", type: "3d", genre: "racing", quality: "LOW" });
    expect(plan.assets[0]?.name).toBe("car");
  });

  it("falls back to a complete offline-safe plan on malformed output", async () => {
    const provider = {
      kind: "codex",
      generateCode: vi.fn(async () => ({ code: "not-json", explanation: "", files: [] })),
    } as unknown as IProvider;

    const plan = await new GamePlanner(provider).analyze("Платформер с прыжками и сбором монет", "AUTO", { type: "auto" });

    expect(plan.type).toBe("2d");
    expect(plan.genre).toBe("platformer");
    expect(plan.assets.length).toBeGreaterThan(0);
    expect(plan.quality).toBe("LOW");
  });

  it("normalizes common AI asset labels to supported resolver types", async () => {
    const provider = {
      kind: "codex-only",
      generateCode: vi.fn(async () => ({
        code: JSON.stringify({
          title: "Goose Run",
          type: "2d",
          genre: "runner",
          mechanics: ["movement", "collectibles"],
          assets: [
            { type: "character", name: "goose", description: "Player goose", tags: ["player"] },
            { type: "sound_effect", name: "honk", description: "Goose honk", tags: ["sfx"] },
            { type: "HUD_ELEMENT", name: "score", description: "Score display", tags: ["hud"] },
          ],
          quality: "LOW",
        }),
        explanation: "planned",
        files: [],
      })),
    } as unknown as IProvider;

    const plan = await new GamePlanner(provider).analyze("A goose runner", "LOW", { type: "2d" });

    expect(plan.assets.map((asset) => asset.type)).toEqual(["sprite", "audio", "ui"]);
    expect(provider.generateCode).toHaveBeenCalledWith(
      expect.stringContaining("3d-model, texture, sprite, audio, ui"),
      expect.objectContaining({ role: "GamePlanner" }),
    );
  });
});
