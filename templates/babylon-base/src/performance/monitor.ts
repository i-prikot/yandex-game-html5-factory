import type { Engine } from "@babylonjs/core/Engines/engine";

import { gameLog } from "../logger";

export type RuntimeQuality = "LOW" | "MEDIUM" | "HIGH";

const QUALITY_ORDER: RuntimeQuality[] = ["LOW", "MEDIUM", "HIGH"];
const TARGET_FPS: Record<RuntimeQuality, number> = { LOW: 30, MEDIUM: 60, HIGH: 60 };
const SCALING: Record<RuntimeQuality, number> = { LOW: 2, MEDIUM: 1.25, HIGH: 1 };

interface NavigatorCapabilities extends Navigator {
  deviceMemory?: number;
}

export interface PerformanceMonitorOptions {
  showOverlay?: boolean;
  lowFpsSamplesBeforeDowngrade?: number;
  onQualityChanged?: (quality: RuntimeQuality) => void;
}

export function detectRuntimeQuality(requested: string): RuntimeQuality {
  const normalized = requested.toUpperCase();
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH") return normalized;
  const capabilities = navigator as NavigatorCapabilities;
  const mobile = /Android|iPhone|iPad|Mobile/iu.test(navigator.userAgent);
  const memory = capabilities.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency || 4;
  const webgl2 = Boolean(document.createElement("canvas").getContext("webgl2"));
  if (!webgl2 || mobile || memory <= 4 || cores <= 4 || window.devicePixelRatio > 2) return "LOW";
  if (memory >= 8 && cores >= 8) return "HIGH";
  return "MEDIUM";
}

export class RuntimePerformanceMonitor {
  private quality: RuntimeQuality;
  private readonly overlay: HTMLDivElement | undefined;
  private frameCount = 0;
  private lowFpsSamples = 0;
  private readonly lowFpsSamplesBeforeDowngrade: number;

  public constructor(
    private readonly engine: Pick<Engine, "getFps" | "setHardwareScalingLevel">,
    requestedQuality: string,
    private readonly options: PerformanceMonitorOptions = {},
  ) {
    this.quality = detectRuntimeQuality(requestedQuality);
    this.lowFpsSamplesBeforeDowngrade = options.lowFpsSamplesBeforeDowngrade ?? 2;
    this.engine.setHardwareScalingLevel(SCALING[this.quality]);
    this.overlay = options.showOverlay === false ? undefined : this.createOverlay();
    this.publishMetrics(0);
    gameLog("info", "Performance monitor initialized", {
      requestedQuality,
      quality: this.quality,
      hardwareScalingLevel: SCALING[this.quality],
    });
  }

  public onFrame(): void {
    this.frameCount += 1;
    if (this.frameCount % 30 === 0) this.recordFps(this.engine.getFps());
  }

  public recordFps(fps: number): RuntimeQuality {
    const roundedFps = Math.max(0, Math.round(fps));
    const target = TARGET_FPS[this.quality];
    this.lowFpsSamples = roundedFps < target * 0.8 ? this.lowFpsSamples + 1 : 0;
    if (this.lowFpsSamples >= this.lowFpsSamplesBeforeDowngrade) {
      this.downgrade(roundedFps);
      this.lowFpsSamples = 0;
    }
    this.publishMetrics(roundedFps);
    if (this.overlay) this.overlay.textContent = `${roundedFps} FPS | ${this.quality}`;
    return this.quality;
  }

  public getQuality(): RuntimeQuality {
    return this.quality;
  }

  private downgrade(fps: number): void {
    const currentIndex = QUALITY_ORDER.indexOf(this.quality);
    if (currentIndex <= 0) {
      gameLog("warn", "FPS drop detected at minimum quality", { fps, quality: this.quality });
      return;
    }
    const next = QUALITY_ORDER[currentIndex - 1];
    if (!next) return;
    gameLog("warn", "FPS drop detected", { fps, quality: this.quality, targetFPS: TARGET_FPS[this.quality] });
    this.quality = next;
    this.engine.setHardwareScalingLevel(SCALING[next]);
    this.options.onQualityChanged?.(next);
    gameLog("info", "Auto-adjusting quality", { quality: next, hardwareScalingLevel: SCALING[next] });
  }

  private publishMetrics(fps: number): void {
    window.__GAME_METRICS__ = {
      ...window.__GAME_METRICS__,
      fps,
      quality: this.quality,
      hardwareScalingLevel: SCALING[this.quality],
      targetFPS: TARGET_FPS[this.quality],
    };
  }

  private createOverlay(): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.id = "performance-monitor";
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      right: "8px",
      top: "8px",
      zIndex: "1000",
      padding: "4px 7px",
      color: "#ffffff",
      background: "rgba(0, 0, 0, 0.65)",
      font: "12px monospace",
      pointerEvents: "none",
    });
    document.body.append(overlay);
    return overlay;
  }
}
