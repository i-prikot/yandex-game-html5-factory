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
});
