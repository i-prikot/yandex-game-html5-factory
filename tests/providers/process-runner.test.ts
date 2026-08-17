import { describe, expect, it } from "vitest";

import { runProcess } from "../../src/providers/process-runner.js";

describe("runProcess", () => {
  it("pipes configured stdin to the child process", async () => {
    const input = "Codex prompt delivered through stdin";

    const result = await runProcess(
      process.execPath,
      ["-e", "process.stdin.setEncoding('utf8'); let value = ''; process.stdin.on('data', chunk => value += chunk); process.stdin.on('end', () => process.stdout.write(value));"],
      { cwd: process.cwd(), timeoutMs: 10_000, stdin: input },
    );

    expect(result).toEqual({ exitCode: 0, stdout: input, stderr: "" });
  });
});
