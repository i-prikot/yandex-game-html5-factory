import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { createLogger } from "../core/logger.js";
import type { AssetRequest, AssetResolver, ResolvedAsset } from "./types.js";

function safeToken(value: string): string {
  const token = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
  return token || "asset";
}

function identifier(value: string): string {
  return safeToken(value)
    .split("-")
    .map((part, index) => (index === 0 ? part : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join("");
}

function colorFor(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `#${(hash & 0xffffff).toString(16).padStart(6, "0")}`;
}

function selectPrimitive(tags: readonly string[]): "box" | "sphere" | "cylinder" | "plane" {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.some((tag) => ["ball", "coin", "orb", "sphere"].includes(tag))) return "sphere";
  if (normalized.some((tag) => ["wheel", "tree", "column", "cylinder"].includes(tag))) return "cylinder";
  if (normalized.some((tag) => ["ground", "billboard", "plane"].includes(tag))) return "plane";
  return "box";
}

export function generateBabylonPrimitive(request: AssetRequest): string {
  const token = safeToken(request.name);
  const functionName = `create${identifier(request.name).replace(/^./u, (character) => character.toUpperCase())}`;
  const primitive = selectPrimitive(request.tags);
  const color = colorFor(request.name);
  const builder = {
    box: `MeshBuilder.CreateBox("${token}", { size: 1 }, scene)`,
    sphere: `MeshBuilder.CreateSphere("${token}", { diameter: 1, segments: 12 }, scene)`,
    cylinder: `MeshBuilder.CreateCylinder("${token}", { height: 1, diameter: 0.75, tessellation: 12 }, scene)`,
    plane: `MeshBuilder.CreatePlane("${token}", { size: 1 }, scene)`,
  }[primitive];

  return `import type { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

export function ${functionName}(scene: Scene) {
  const mesh = ${builder};
  const material = new StandardMaterial("${token}-material", scene);
  material.diffuseColor = Color3.FromHexString("${color}");
  material.specularColor.set(0.08, 0.08, 0.08);
  mesh.material = material;
  return mesh;
}
`;
}

export function generatePatternSvg(request: AssetRequest): string {
  const color = colorFor(request.name);
  const pattern = request.tags.some((tag) => tag.toLowerCase().includes("stripe"))
    ? `<path d="M-16 16L16-16M0 32L32 0M16 48L48 16" stroke="#ffffff" stroke-opacity=".22" stroke-width="8"/>`
    : `<path d="M0 0h16v16H0zM16 16h16v16H16z" fill="#ffffff" fill-opacity=".18"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><rect width="32" height="32" fill="${color}"/>${pattern}</svg>`;
}

export class ProceduralAssetResolver implements AssetResolver {
  public readonly source = "procedural" as const;
  private readonly logger = createLogger("asset-procedural");

  public async resolve(request: AssetRequest, projectPath: string): Promise<ResolvedAsset> {
    this.logger.warn("Using procedural fallback for asset", { asset: request.name, type: request.type });
    const token = safeToken(request.name);

    if (request.type === "3d-model") {
      const outputPath = join(projectPath, "src", "generated-assets", `${token}.ts`);
      const moduleCode = generateBabylonPrimitive(request);
      await mkdir(join(projectPath, "src", "generated-assets"), { recursive: true });
      await writeFile(outputPath, moduleCode, "utf8");
      this.logger.debug("Procedural Babylon module written", { outputPath, primitive: selectPrimitive(request.tags) });
      return {
        request,
        source: this.source,
        outputPath: relative(projectPath, outputPath),
        moduleCode,
        license: "Generated in project; no external license",
        metadata: { primitive: selectPrimitive(request.tags), color: colorFor(request.name) },
      };
    }

    const outputPath = join(projectPath, "public", "assets", `${token}.svg`);
    await mkdir(join(projectPath, "public", "assets"), { recursive: true });
    await writeFile(outputPath, generatePatternSvg(request), "utf8");
    this.logger.debug("Procedural SVG written", { outputPath });
    return {
      request,
      source: this.source,
      outputPath: relative(projectPath, outputPath),
      license: "Generated in project; no external license",
      metadata: { pattern: request.tags.includes("stripes") ? "stripes" : "checker", color: colorFor(request.name) },
    };
  }
}
