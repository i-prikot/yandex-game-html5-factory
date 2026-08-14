import { createLogger } from "../core/logger.js";
import type {
  AssetRequest,
  AssetResolutionReport,
  AssetResolver,
  ResolvedAsset,
} from "./types.js";

export class AssetResolutionError extends Error {
  public constructor(assetName: string) {
    super(`No resolver could produce the required asset: ${assetName}`);
    this.name = "AssetResolutionError";
  }
}

export class AssetManager {
  private readonly logger = createLogger("asset-manager");

  public constructor(private readonly resolvers: readonly AssetResolver[]) {
    if (resolvers.length === 0) {
      throw new Error("AssetManager requires at least one resolver");
    }
  }

  public async resolveAssets(
    assets: readonly AssetRequest[],
    projectPath: string,
  ): Promise<AssetResolutionReport> {
    this.logger.info("Resolving game assets", { count: assets.length, projectPath });
    const resolvedAssets: ResolvedAsset[] = [];

    for (const request of assets) {
      resolvedAssets.push(await this.resolveOne(request, projectPath));
    }

    const fallbackCount = resolvedAssets.filter((asset) => asset.source === "procedural").length;
    this.logger.info("Asset resolution completed", {
      count: resolvedAssets.length,
      fallbackCount,
    });
    return { assets: resolvedAssets, fallbackCount };
  }

  private async resolveOne(request: AssetRequest, projectPath: string): Promise<ResolvedAsset> {
    this.logger.info("Resolving asset", { asset: request.name, type: request.type });
    for (const resolver of this.resolvers) {
      this.logger.debug("Trying asset resolver", { asset: request.name, source: resolver.source });
      try {
        const result = await resolver.resolve(request, projectPath);
        if (result) {
          this.logger.info("Asset resolved", { asset: request.name, source: result.source });
          return result;
        }
      } catch (error) {
        this.logger.warn("Asset resolver failed; continuing fallback chain", {
          asset: request.name,
          source: resolver.source,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new AssetResolutionError(request.name);
  }
}
