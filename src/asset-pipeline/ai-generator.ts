import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import { createLogger } from "../core/logger.js";
import type { AssetRequest, AssetResolver, ResolvedAsset } from "./types.js";

type Fetcher = typeof fetch;

interface AiAssetGeneratorOptions {
  fetcher?: Fetcher;
  pollDelayMs?: number;
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "asset";
}

async function responseError(response: Response): Promise<Error> {
  return new Error(`Asset API request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
}

export class AiAssetGenerator implements AssetResolver {
  public readonly source = "ai" as const;
  private readonly logger = createLogger("asset-ai-generator");
  private readonly fetcher: Fetcher;
  private readonly pollDelayMs: number;

  public constructor(options: AiAssetGeneratorOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.pollDelayMs = options.pollDelayMs ?? 2_000;
  }

  public async resolve(request: AssetRequest, projectPath: string): Promise<ResolvedAsset | null> {
    this.logger.info("Requesting AI asset generation", { asset: request.name, type: request.type });
    try {
      if (request.type === "3d-model") {
        if (!process.env.TRIPO3D_API_KEY) {
          this.logger.warn("TRIPO3D_API_KEY is absent; skipping AI model generation", { asset: request.name });
          return null;
        }
        return await this.generateTripoModel(request, projectPath, process.env.TRIPO3D_API_KEY);
      }

      if (!["texture", "sprite"].includes(request.type)) {
        return null;
      }
      if (process.env.XAI_API_KEY) {
        return await this.generateXaiImage(request, projectPath, process.env.XAI_API_KEY);
      }
      if (process.env.GOOGLE_API_KEY) {
        return await this.generateGoogleImage(request, projectPath, process.env.GOOGLE_API_KEY);
      }

      this.logger.warn("No image generation API key is available; skipping AI generation", { asset: request.name });
      return null;
    } catch (error) {
      this.logger.error("AI asset generation failed; allowing fallback", error, {
        asset: request.name,
        type: request.type,
      });
      return null;
    }
  }

  private async generateXaiImage(
    request: AssetRequest,
    projectPath: string,
    apiKey: string,
  ): Promise<ResolvedAsset> {
    const response = await this.fetcher("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "grok-2-image-1212", prompt: request.description, response_format: "b64_json" }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw await responseError(response);
    const payload = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const item = payload.data?.[0];
    const bytes = item?.b64_json
      ? Buffer.from(item.b64_json, "base64")
      : item?.url
        ? Buffer.from(await (await this.fetcher(item.url)).arrayBuffer())
        : null;
    if (!bytes) throw new Error("xAI returned no image data");
    return this.save(request, projectPath, bytes, ".png", "xAI");
  }

  private async generateGoogleImage(
    request: AssetRequest,
    projectPath: string,
    apiKey: string,
  ): Promise<ResolvedAsset> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await this.fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: request.description }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw await responseError(response);
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
    };
    const base64 = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;
    if (!base64) throw new Error("Google returned no image data");
    return this.save(request, projectPath, Buffer.from(base64, "base64"), ".png", "Google Gemini");
  }

  private async generateTripoModel(
    request: AssetRequest,
    projectPath: string,
    apiKey: string,
  ): Promise<ResolvedAsset> {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    const createResponse = await this.fetcher("https://api.tripo3d.ai/v2/openapi/task", {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "text_to_model", prompt: request.description }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!createResponse.ok) throw await responseError(createResponse);
    const createPayload = (await createResponse.json()) as { data?: { task_id?: string } };
    const taskId = createPayload.data?.task_id;
    if (!taskId) throw new Error("Tripo3D returned no task id");

    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, this.pollDelayMs));
      const pollResponse = await this.fetcher(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!pollResponse.ok) throw await responseError(pollResponse);
      const payload = (await pollResponse.json()) as {
        data?: { status?: string; output?: { model?: string; pbr_model?: string } };
      };
      if (payload.data?.status === "failed") throw new Error(`Tripo3D task failed: ${taskId}`);
      const modelUrl = payload.data?.output?.pbr_model ?? payload.data?.output?.model;
      if (payload.data?.status === "success" && modelUrl) {
        const modelResponse = await this.fetcher(modelUrl);
        if (!modelResponse.ok) throw await responseError(modelResponse);
        return this.save(request, projectPath, Buffer.from(await modelResponse.arrayBuffer()), ".glb", "Tripo3D");
      }
    }
    throw new Error(`Tripo3D task timed out: ${taskId}`);
  }

  private async save(
    request: AssetRequest,
    projectPath: string,
    bytes: Buffer,
    extension: string,
    provider: string,
  ): Promise<ResolvedAsset> {
    const filename = `${safeName(request.name)}${extension}`;
    const outputPath = join(projectPath, "public", "assets", basename(filename));
    await mkdir(join(projectPath, "public", "assets"), { recursive: true });
    await writeFile(outputPath, bytes);
    this.logger.info("AI asset generated", { asset: request.name, provider, bytes: bytes.length });
    return {
      request,
      source: this.source,
      outputPath: relative(projectPath, outputPath),
      license: `Generated through ${provider}; verify provider terms`,
      metadata: { provider, bytes: bytes.length },
    };
  }
}
