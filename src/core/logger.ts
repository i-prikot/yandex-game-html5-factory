export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function resolveLevel(value: string | undefined): LogLevel {
  const normalized = value?.toLowerCase();
  return normalized && normalized in LEVEL_PRIORITY
    ? (normalized as LogLevel)
    : "info";
}

function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  return { name: error.name, message: error.message, stack: error.stack };
}

export class Logger {
  public constructor(
    private readonly scope: string,
    private readonly level: LogLevel = resolveLevel(process.env.LOG_LEVEL),
  ) {}

  public debug(message: string, context: Record<string, unknown> = {}): void {
    this.write("debug", message, context);
  }

  public info(message: string, context: Record<string, unknown> = {}): void {
    this.write("info", message, context);
  }

  public warn(message: string, context: Record<string, unknown> = {}): void {
    this.write("warn", message, context);
  }

  public error(message: string, error: unknown, context: Record<string, unknown> = {}): void {
    this.write("error", message, { ...context, error: serializeError(error) });
  }

  private write(level: Exclude<LogLevel, "silent">, message: string, context: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }

    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      ...context,
    });

    const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    writer(record);
  }
}

export function createLogger(scope: string): Logger {
  return new Logger(scope);
}
