import { spawn } from "node:child_process";

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ProcessRunner = (
  command: string,
  args: readonly string[],
  options: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv; stdin?: string },
) => Promise<ProcessResult>;

export const runProcess: ProcessRunner = async (command, args, options) =>
  new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let isSettled = false;

    const timer = setTimeout(() => {
      if (!isSettled) {
        child.kill("SIGTERM");
        reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
      }
    }, options.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    if (options.stdin !== undefined) {
      child.stdin?.end(options.stdin);
    }
    child.on("error", (error) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.on("close", (exitCode) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      }
    });
  });
