export type AssetType = "3d-model" | "texture" | "sprite" | "audio" | "ui";
export type AssetSource = "ai" | "local" | "procedural";

export interface AssetRequest {
  type: AssetType;
  name: string;
  description: string;
  tags: string[];
}

export interface ResolvedAsset {
  request: AssetRequest;
  source: AssetSource;
  outputPath?: string;
  moduleCode?: string;
  license: string;
  metadata: Record<string, string | number | boolean>;
}

export interface AssetResolver {
  readonly source: AssetSource;
  resolve(request: AssetRequest, projectPath: string): Promise<ResolvedAsset | null>;
}

export interface AssetResolutionReport {
  assets: ResolvedAsset[];
  fallbackCount: number;
}
