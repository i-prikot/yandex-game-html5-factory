type BrowserLogLevel = "debug" | "info" | "warn" | "error" | "silent";
const levels: Record<BrowserLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const requested = (import.meta.env.VITE_LOG_LEVEL ?? "info").toLowerCase() as BrowserLogLevel;
const active = requested in levels ? requested : "info";

export function gameLog(level: Exclude<BrowserLogLevel, "silent">, message: string, context: Record<string, unknown> = {}): void {
  if (levels[level] < levels[active]) return;
  const record = { scope: "generated-game", level, message, ...context };
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.log(record);
}
