import { type Logger, pino } from "pino";
import { build as pretty } from "pino-pretty";

export type { Logger };

export function createLogger(level: string, format: "pretty" | "json" = "json"): Logger {
  return pino(
    {
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
    },
    format === "pretty" ? pretty({ colorize: false, singleLine: true, ignore: "pid,hostname,service", translateTime: "SYS:HH:MM:ss" }) : undefined,
  );
}
