/** Tailwind needs static class names, so aspect ratios snap to the nearest of a fixed set. */
const RATIOS = [
  { ratio: 9 / 16, className: "aspect-[9/16]" },
  { ratio: 3 / 4, className: "aspect-[3/4]" },
  { ratio: 4 / 5, className: "aspect-[4/5]" },
  { ratio: 1, className: "aspect-square" },
  { ratio: 4 / 3, className: "aspect-[4/3]" },
  { ratio: 16 / 9, className: "aspect-video" },
] as const;

export function aspectClass(ratio: number | null | undefined): string {
  if (!ratio) return "aspect-[4/5]";
  let best: (typeof RATIOS)[number] = RATIOS[3];
  for (const r of RATIOS) if (Math.abs(Math.log(r.ratio / ratio)) < Math.abs(Math.log(best.ratio / ratio))) best = r;
  return best.className;
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** Share sheets often send "Check this out https://…"; pull the first URL out of the text. */
export function extractUrl(text: string | null | undefined): string | null {
  const m = text ? URL_RE.exec(text) : null;
  return m ? m[0].replace(/[).,;]+$/, "") : null;
}

const URL_RE_ALL = /https?:\/\/[^\s<>"']+/gi;

/** Every http(s) link in a block of text, in order, without duplicates and without trailing punctuation. */
export function extractUrls(text: string | null | undefined): string[] {
  const found = (text ?? "").match(URL_RE_ALL) ?? [];
  return [...new Set(found.map((u) => u.replace(/[).,;]+$/, "")))];
}

/** Sizes the way the server counts them: 1 GB = 1024^3 bytes. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(/.0$/, "")} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${String(Math.round(bytes / 1024))} KB`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
