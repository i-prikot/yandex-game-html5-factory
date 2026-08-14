import { PNG } from "pngjs";

import { createLogger } from "../core/logger.js";
import type { AnalysisResponse, IProvider } from "../providers/base.js";
import type { BrowserTestResult } from "./tester.js";

export interface VisualReview extends AnalysisResponse {
  evidence: {
    width: number;
    height: number;
    visiblePixelRatio: number;
    meanLuminance: number;
    luminanceDeviation: number;
  };
  source: "local" | "local+vision";
}

const logger = createLogger("visual-reviewer");

function inspectPixels(screenshot: string): VisualReview["evidence"] {
  const image = PNG.sync.read(Buffer.from(screenshot, "base64"));
  let visiblePixels = 0;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  const pixelCount = image.width * image.height;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    const alpha = image.data[offset + 3] ?? 0;
    if (alpha > 10) visiblePixels += 1;
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * (alpha / 255);
    luminanceSum += luminance;
    luminanceSquaredSum += luminance ** 2;
  }
  const meanLuminance = pixelCount > 0 ? luminanceSum / pixelCount : 0;
  const variance = pixelCount > 0 ? Math.max(0, luminanceSquaredSum / pixelCount - meanLuminance ** 2) : 0;
  return {
    width: image.width,
    height: image.height,
    visiblePixelRatio: pixelCount > 0 ? visiblePixels / pixelCount : 0,
    meanLuminance,
    luminanceDeviation: Math.sqrt(variance),
  };
}

export class VisualReviewer {
  public constructor(private readonly provider?: IProvider) {}

  public async analyze(result: BrowserTestResult, projectPath: string): Promise<VisualReview> {
    logger.info("Analyzing screenshot", {
      projectPath,
      consoleErrors: result.consoleErrors.length,
      requestFailures: result.requestFailures.length,
    });
    const evidence = inspectPixels(result.screenshot);
    const issues: string[] = [];
    const suggestions: string[] = [];
    if (evidence.visiblePixelRatio < 0.1) {
      issues.push("Screenshot is empty or transparent");
      suggestions.push("Ensure the renderer clears and draws a visible frame before setting __GAME_READY__");
    } else if (evidence.meanLuminance < 8 && evidence.luminanceDeviation < 8) {
      issues.push("Screenshot is black or nearly black");
      suggestions.push("Check camera position, lighting, clear color, and material visibility");
    } else if (evidence.luminanceDeviation < 2) {
      issues.push("Screenshot is nearly uniform and contains no distinguishable gameplay objects");
      suggestions.push("Place the camera on the gameplay area and render contrasting objects and UI");
    }
    if (result.consoleErrors.length > 0) {
      issues.push(...result.consoleErrors.map((error) => `Browser console error: ${error}`));
      suggestions.push("Resolve runtime JavaScript errors before visual approval");
    }
    if (result.requestFailures.length > 0) {
      issues.push(...result.requestFailures.map((failure) => `Resource request failed: ${failure}`));
      suggestions.push("Fix missing or unreachable game assets");
    }

    let source: VisualReview["source"] = "local";
    let confidence = issues.length > 0 ? 0.98 : 0.75;
    if (this.provider && await this.provider.isAvailable()) {
      try {
        const vision = await this.provider.analyzeScreenshot(result.screenshot, {
          projectPath,
          role: "VisualReviewer",
          metadata: {
            consoleErrorCount: result.consoleErrors.length,
            requestFailureCount: result.requestFailures.length,
            ...result.metrics,
          },
        });
        source = "local+vision";
        confidence = Math.max(confidence, vision.confidence);
        issues.push(...vision.issues);
        suggestions.push(...vision.suggestions);
        logger.debug("Vision provider response merged", { provider: this.provider.kind, vision });
      } catch (error) {
        logger.warn("Vision analysis unavailable; using local evidence", {
          provider: this.provider.kind,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const uniqueIssues = [...new Set(issues)];
    const uniqueSuggestions = [...new Set(suggestions)];
    for (const issue of uniqueIssues) logger.warn("Visual issue detected", { issue });
    const review: VisualReview = {
      passed: uniqueIssues.length === 0,
      issues: uniqueIssues,
      suggestions: uniqueSuggestions,
      confidence,
      evidence,
      source,
    };
    logger.info("Screenshot analysis completed", { passed: review.passed, issueCount: review.issues.length, evidence });
    return review;
  }
}

export { inspectPixels };
