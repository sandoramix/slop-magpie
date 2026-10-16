// postgres.js errors carry the SQLSTATE in `code`; drizzle may wrap them in `cause`.
function sqlState(error: unknown): string | undefined {
  for (let e: unknown = error, depth = 0; e instanceof Error && depth < 4; e = e.cause, depth++) {
    if ("code" in e && typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

export const isUniqueViolation = (error: unknown): boolean => sqlState(error) === "23505";
export const isForeignKeyViolation = (error: unknown): boolean => sqlState(error) === "23503";
