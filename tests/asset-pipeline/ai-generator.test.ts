import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AiAssetGenerator } from "../../src/asset-pipeline/ai-generator.js";

const createdDirectories: string[] = [];
const originalKeys = {
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  XAI_API_KEY: process.env.XAI_API_KEY,
  TRIPO3D_API_KEY: process.env.TRIPO3D_API_KEY,
};

afterEach(async () => {
  Object.assign(process.env, originalKeys);
  for (const key of Object.keys(originalKeys)) {
    if (originalKeys[key as keyof typeof originalKeys] === undefined) delete process.env[key];
  }
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("AiAssetGenerator", () => {
  it("returns null without any matching API key", async () => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.TRIPO3D_API_KEY;
    const fetcher = vi.fn<typeof fetch>();
    const generator = new AiAssetGenerator({ fetcher });

    await expect(
      generator.resolve(
        { type: "texture", name: "Road", description: "Road texture", tags: [] },
        process.cwd(),
      ),
    ).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("writes xAI base64 image output", async () => {
    process.env.XAI_API_KEY = "test-key";
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "ai-generator-test-"));
    createdDirectories.push(projectPath);
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("png-data").toString("base64") }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const generator = new AiAssetGenerator({ fetcher });

    const result = await generator.resolve(
      { type: "texture", name: "Road", description: "Road texture", tags: [] },
      projectPath,
    );

    expect(result).toMatchObject({ source: "ai", outputPath: "public/assets/road.png" });
    const requestHeaders = fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(requestHeaders.Authorization).toBe("Bearer test-key");
  });
});
