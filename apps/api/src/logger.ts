import { type Logger, pino } from "pino";

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: "api" },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.authorization",
        "*.token",
        "*.apiToken",
        "*.cookie",
        "*.cookies",
        "*.password",
        "*.secret",
      ],
      censor: "[redacted]",
    },
  });
}
