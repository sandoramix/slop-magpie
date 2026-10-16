import { type Logger, pino } from "pino";
import { build as pretty } from "pino-pretty";

export type { Logger };

export function createLogger(level: string, format: "pretty" | "json" = "json"): Logger {
  return pino(
    {
      level,
      base: { service: "worker" },
      redact: {
        paths: ["*.authorization", "*.token", "*.cookie", "*.cookies", "*.cookiesFile", "*.password", "*.secret", "*.signedUrl"],
        censor: "[redacted]",
      },
    },
    // redaction runs before the stream, so pretty output is as safe as json
    format === "pretty" ? pretty({ colorize: false, singleLine: true, ignore: "pid,hostname,service", translateTime: "SYS:HH:MM:ss" }) : undefined,
  );
}
