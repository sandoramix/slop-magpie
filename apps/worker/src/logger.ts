import { type Logger, pino } from "pino";

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: "worker" },
    redact: {
      paths: ["*.authorization", "*.token", "*.cookie", "*.cookies", "*.cookiesFile", "*.password", "*.secret", "*.signedUrl"],
      censor: "[redacted]",
    },
  });
}
