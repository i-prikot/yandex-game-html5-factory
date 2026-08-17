import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import archiver from "archiver";

import { createLogger } from "../core/logger.js";
import { runProcess, type ProcessRunner } from "../providers/process-runner.js";

export interface ProductionPackage {
  projectPath: string;
  distPath: string;
  packagePath: string;
  sizeBytes: number;
}

export interface BuildManagerOptions {
  outputRoot?: string;
  runner?: ProcessRunner;
}

const logger = createLogger("agent-build-manager");
const SECRET_ENV_NAMES = [
  "GOOGLE_API_KEY",
  "XAI_API_KEY",
  "TRIPO3D_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "CRS_OAI_KEY",
];

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
  }));
  return files.flat();
}

async function assertNoSecrets(distPath: string): Promise<void> {
  const secrets = SECRET_ENV_NAMES.map((name) => ({ name, value: process.env[name] })).filter(
    (entry): entry is { name: string; value: string } => Boolean(entry.value && entry.value.length >= 8),
  );
  if (secrets.length === 0) return;
  const textExtensions = new Set([".html", ".js", ".css", ".json", ".map", ".txt"]);
  for (const file of await listFiles(distPath)) {
    if (!textExtensions.has(extname(file))) continue;
    const content = await readFile(file, "utf8");
    const exposed = secrets.find((secret) => content.includes(secret.value));
    if (exposed) throw new Error(`Production output contains the value of ${exposed.name}`);
  }
}

async function createZip(distPath: string, packagePath: string): Promise<void> {
  await new Promise<void>((resolveArchive, reject) => {
    const output = createWriteStream(packagePath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.once("close", resolveArchive);
    output.once("error", reject);
    archive.once("error", reject);
    archive.on("warning", (error) => logger.warn("ZIP archive warning", { message: error.message }));
    archive.pipe(output);
    archive.directory(distPath, false);
    void archive.finalize();
  });
}

export class BuildManager {
  private readonly outputRoot: string;
  private readonly runner: ProcessRunner;

  public constructor(options: BuildManagerOptions = {}) {
    this.outputRoot = resolve(options.outputRoot ?? process.env.FACTORY_OUTPUT_DIR ?? "output");
    this.runner = options.runner ?? runProcess;
  }

  public async buildForYandex(projectPathInput: string): Promise<ProductionPackage> {
    const projectPath = resolve(projectPathInput);
    const distPath = join(projectPath, "dist");
    logger.info("Building production package", { projectPath, outputRoot: this.outputRoot });
    const build = await this.runner("npm", ["run", "build"], { cwd: projectPath, timeoutMs: 300_000 });
    if (build.exitCode !== 0) {
      const error = new Error(`Game build failed with exit code ${build.exitCode}: ${build.stderr.slice(-4_000)}`);
      logger.error("Production build failed", error, { projectPath });
      throw error;
    }
    const indexPath = join(distPath, "index.html");
    const index = await readFile(indexPath, "utf8");
    if (!index.includes("https://yandex.ru/games/sdk/v2")) {
      throw new Error("Production index.html does not load Yandex Games SDK v2");
    }
    if (!(await stat(indexPath)).isFile()) throw new Error("Production index.html is not a file");
    await assertNoSecrets(distPath);
    const packagesDirectory = join(this.outputRoot, "packages");
    await mkdir(packagesDirectory, { recursive: true });
    const packagePath = join(packagesDirectory, `${basename(projectPath)}.zip`);
    logger.debug("Creating Yandex package ZIP", { distPath, packagePath });
    await createZip(distPath, packagePath);
    const sizeBytes = (await stat(packagePath)).size;
    if (sizeBytes === 0) throw new Error("Production package ZIP is empty");
    logger.info("Production package created", { packagePath, sizeBytes });
    return { projectPath, distPath, packagePath, sizeBytes };
  }
}
