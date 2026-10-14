@AGENTS.md

## Claude Code notes

- Agent instructions above are the source of truth; keep this file to Claude-specific additions only.
- Owner prefers TypeScript, strong typing, and simple single-language stacks. Do not propose Python for project code.
- Target host is a Raspberry Pi 5 (16 GB, ARM64) running Coolify with other services; Postgres is an existing external instance reached via `DATABASE_URL`.
- Do not commit or push unless asked.
