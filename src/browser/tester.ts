import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import puppeteer, { type Browser, type LaunchOptions } from "puppeteer";

import { createLogger } from "../core/logger.js";

export interface BrowserTestResult {
  screenshot: string;
  screenshotPath: string;
  consoleErrors: string[];
  consoleMessages: string[];
  requestFailures: string[];
  metrics: Readonly<Record<string, string | number | boolean>>;
  url: string;
  durationMs: number;
}

export interface DevServerHandle {
  readonly url: string;
  stop(): Promise<void>;
}

export type DevServerStarter = (projectPath: string, port: number) => Promise<DevServerHandle>;
export type BrowserLauncher = (options: LaunchOptions) => Promise<Browser>;

export interface BrowserTesterOptions {
  port?: number;
  navigationTimeoutMs?: number;
  readyTimeoutMs?: number;
  launchBrowser?: BrowserLauncher;
  startServer?: DevServerStarter;
}

const logger = createLogger("browser-tester");

async function reservePort(): Promise<number> {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to reserve a browser test port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function waitForServer(url: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Vite exited before becoming ready (code ${child.exitCode})`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  throw new Error(`Vite did not become ready within ${timeoutMs}ms`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  const closed = new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
  const signal = (value: NodeJS.Signals): void => {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, value);
      else child.kill(value);
    } catch (error) {
      logger.debug("Vite process group was already stopped", {
        signal: value,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };
  signal("SIGTERM");
  await Promise.race([closed, new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 2_000))]);
  if (child.exitCode === null) signal("SIGKILL");
}

export const startViteServer: DevServerStarter = async (projectPath, port) => {
  logger.debug("Starting Vite process", { projectPath, port });
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: projectPath,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
    logger.debug("Vite stderr", { chunk: chunk.trim().slice(0, 500) });
  });
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => logger.debug("Vite stdout", { chunk: chunk.trim().slice(0, 500) }));
  child.once("error", (error) => logger.error("Vite process error", error, { projectPath, port }));
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(url, child, 30_000);
  } catch (error) {
    await stopChild(child);
    throw new Error(`Unable to start Vite: ${error instanceof Error ? error.message : String(error)} ${stderr.slice(-500)}`);
  }
  return { url, stop: () => stopChild(child) };
};

export class BrowserTester {
  private readonly navigationTimeoutMs: number;
  private readonly readyTimeoutMs: number;
  private readonly launchBrowser: BrowserLauncher;
  private readonly startServer: DevServerStarter;

  public constructor(private readonly options: BrowserTesterOptions = {}) {
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 20_000;
    this.launchBrowser = options.launchBrowser ?? ((launchOptions) => puppeteer.launch(launchOptions));
    this.startServer = options.startServer ?? startViteServer;
  }

  public async run(projectPathInput: string): Promise<BrowserTestResult> {
    const projectPath = resolve(projectPathInput);
    const port = this.options.port ?? await reservePort();
    const startedAt = Date.now();
    logger.info("Starting browser test", { projectPath, port });
    let server: DevServerHandle | undefined;
    let browser: Browser | undefined;
    try {
      server = await this.startServer(projectPath, port);
      const launchOptions: LaunchOptions = {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
      };
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      if (executablePath) launchOptions.executablePath = executablePath;
      logger.debug("Launching Chromium", { executablePath: executablePath ?? "bundled", url: server.url });
      browser = await this.launchBrowser(launchOptions);
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(this.navigationTimeoutMs);
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      const consoleErrors: string[] = [];
      const consoleMessages: string[] = [];
      const requestFailures: string[] = [];
      page.on("console", (message) => {
        const text = message.text();
        consoleMessages.push(`[${message.type()}] ${text}`);
        if (message.type() === "error") consoleErrors.push(text);
      });
      page.on("pageerror", (error) => consoleErrors.push(error instanceof Error ? error.message : String(error)));
      page.on("requestfailed", (request) => {
        requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown failure"}`);
      });

      await page.goto(server.url, { waitUntil: "networkidle2" });
      await page.waitForFunction(
        () => (window as Window & { __GAME_READY__?: boolean }).__GAME_READY__ === true,
        { timeout: this.readyTimeoutMs },
      );
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      const metrics = await page.evaluate(
        () => (window as Window & {
          __GAME_METRICS__?: Record<string, string | number | boolean>;
        }).__GAME_METRICS__ ?? {},
      );
      const screenshot = await page.screenshot({ encoding: "base64", type: "png", fullPage: false });
      const evidenceDirectory = join(projectPath, ".factory", "evidence");
      const screenshotPath = join(evidenceDirectory, "latest.png");
      await mkdir(evidenceDirectory, { recursive: true });
      await writeFile(screenshotPath, Buffer.from(screenshot, "base64"));
      const result: BrowserTestResult = {
        screenshot,
        screenshotPath,
        consoleErrors,
        consoleMessages,
        requestFailures,
        metrics,
        url: server.url,
        durationMs: Date.now() - startedAt,
      };
      logger.info("Browser test completed", {
        projectPath,
        durationMs: result.durationMs,
        consoleErrors: consoleErrors.length,
        requestFailures: requestFailures.length,
        metrics,
      });
      return result;
    } catch (error) {
      logger.error("Browser test failed", error, { projectPath, port });
      throw error;
    } finally {
      await browser?.close().catch((error: unknown) => logger.error("Unable to close browser", error));
      await server?.stop().catch((error: unknown) => logger.error("Unable to stop Vite", error));
    }
  }
}
