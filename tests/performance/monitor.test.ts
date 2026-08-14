import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectRuntimeQuality,
  RuntimePerformanceMonitor,
} from "../../templates/babylon-base/src/performance/monitor.js";

beforeEach(() => {
  vi.stubGlobal("window", { devicePixelRatio: 1, __GAME_METRICS__: {} });
  vi.stubGlobal("navigator", { userAgent: "Desktop", hardwareConcurrency: 8, deviceMemory: 8 });
  vi.stubGlobal("document", {
    createElement: () => ({ getContext: () => ({}) }),
  });
});

describe("RuntimePerformanceMonitor", () => {
  it("detects a conservative AUTO preset on weak devices", () => {
    vi.stubGlobal("navigator", { userAgent: "Desktop", hardwareConcurrency: 2, deviceMemory: 2 });
    expect(detectRuntimeQuality("AUTO")).toBe("LOW");
  });

  it("downgrades quality after sustained FPS drops", () => {
    const setHardwareScalingLevel = vi.fn();
    const monitor = new RuntimePerformanceMonitor(
      { getFps: () => 20, setHardwareScalingLevel },
      "HIGH",
      { showOverlay: false, lowFpsSamplesBeforeDowngrade: 2 },
    );

    expect(monitor.recordFps(20)).toBe("HIGH");
    expect(monitor.recordFps(20)).toBe("MEDIUM");
    expect(setHardwareScalingLevel).toHaveBeenLastCalledWith(1.25);
    expect(window.__GAME_METRICS__).toMatchObject({ fps: 20, quality: "MEDIUM" });
  });

  it("never degrades below LOW", () => {
    const setHardwareScalingLevel = vi.fn();
    const monitor = new RuntimePerformanceMonitor(
      { getFps: () => 5, setHardwareScalingLevel },
      "LOW",
      { showOverlay: false, lowFpsSamplesBeforeDowngrade: 1 },
    );

    expect(monitor.recordFps(5)).toBe("LOW");
    expect(setHardwareScalingLevel).toHaveBeenCalledTimes(1);
  });
});
