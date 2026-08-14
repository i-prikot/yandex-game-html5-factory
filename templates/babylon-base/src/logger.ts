type BrowserLogLevel = "debug" | "info" | "warn" | "error" | "silent";

const levels: Record<BrowserLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const configured = (import.meta.env.VITE_LOG_LEVEL ?? "info").toLowerCase() as BrowserLogLevel;
const activeLevel = configured in levels ? configured : "info";

export function gameLog(level: Exclude<BrowserLogLevel, "silent">, message: string, context: Record<string, unknown> = {}): void {
  if (levels[level] < levels[activeLevel]) return;
  const record = { scope: "generated-game", level, message, ...context };
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.log(record);
}
