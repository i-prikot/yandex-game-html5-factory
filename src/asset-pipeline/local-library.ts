import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { z } from "zod";

import { createLogger } from "../core/logger.js";
import type { AssetRequest, AssetResolver, ResolvedAsset } from "./types.js";

const manifestSchema = z.object({
  assets: z.array(z.object({
    path: z.string(),
    type: z.enum(["3d-model", "texture", "sprite", "audio", "ui"]),
    tags: z.array(z.string()),
    license: z.string(),
  })),
});

export class LocalAssetLibrary implements AssetResolver {
  public readonly source = "local" as const;
  private readonly logger = createLogger("asset-local-library");

  public constructor(private readonly libraryPath = join(process.cwd(), "assets", "library")) {}

  public async resolve(request: AssetRequest, projectPath: string): Promise<ResolvedAsset | null> {
    this.logger.debug("Searching local asset library", { asset: request.name, tags: request.tags });
    const manifestContent = await readFile(join(this.libraryPath, "manifest.json"), "utf8");
    const manifest = manifestSchema.parse(JSON.parse(manifestContent));
    const requestTags = new Set(request.tags.map((tag) => tag.toLowerCase()));
    requestTags.add(request.name.toLowerCase());
    const match = manifest.assets
      .filter((asset) => asset.type === request.type)
      .map((asset) => ({
        asset,
        score: asset.tags.reduce((score, tag) => score + (requestTags.has(tag.toLowerCase()) ? 1 : 0), 0),
      }))
      .sort((left, right) => right.score - left.score)
      .find(({ score }) => score > 0)?.asset;

    if (!match) {
      this.logger.debug("No matching local asset found", { asset: request.name });
      return null;
    }

    const sourcePath = resolve(this.libraryPath, match.path);
    if (!sourcePath.startsWith(`${resolve(this.libraryPath)}/`)) {
      throw new Error(`Local asset path escapes library: ${match.path}`);
    }
    const outputPath = join(projectPath, "public", "assets", basename(match.path));
    await mkdir(dirname(outputPath), { recursive: true });
    await copyFile(sourcePath, outputPath);
    this.logger.info("Using local asset", { asset: request.name, filename: match.path });

    return {
      request,
      source: this.source,
      outputPath: relative(projectPath, outputPath),
      license: match.license,
      metadata: { libraryPath: match.path, matchedTags: match.tags.join(",") },
    };
  }
}
