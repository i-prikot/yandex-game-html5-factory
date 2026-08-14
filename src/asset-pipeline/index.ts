import { AiAssetGenerator } from "./ai-generator.js";
import { LocalAssetLibrary } from "./local-library.js";
import { AssetManager } from "./manager.js";
import { ProceduralAssetResolver } from "./procedural.js";

export * from "./ai-generator.js";
export * from "./local-library.js";
export * from "./manager.js";
export * from "./procedural.js";
export * from "./types.js";

export function createAssetManager(): AssetManager {
  return new AssetManager([
    new AiAssetGenerator(),
    new LocalAssetLibrary(),
    new ProceduralAssetResolver(),
  ]);
}
