import { afterEach, describe, expect, it, vi } from "vitest";

import { printProgress } from "../../src/cli/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("printProgress", () => {
  it("prints phase position, elapsed time, and timeout budget", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printProgress({
      stage: "gameplay-phase-2",
      status: "started",
      message: "player-movement progress",
      timestamp: "2026-08-17T00:00:00.000Z",
      phase: {
        number: 2,
        total: 5,
        name: "player-movement",
        elapsedMs: 45_000,
        timeoutMs: 90_000,
      },
    });

    expect(log).toHaveBeenCalledWith(
      "[RUN] Phase 2/5: player-movement (45s / 90s budget)",
    );
  });

  it("keeps the existing stage output for non-phase events", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printProgress({
      stage: "planning",
      status: "completed",
      message: "2D arcade planned for LOW",
      timestamp: "2026-08-17T00:00:00.000Z",
    });

    expect(log).toHaveBeenCalledWith("[OK] planning: 2D arcade planned for LOW");
  });
});
