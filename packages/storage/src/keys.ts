import { InvalidKeyError } from "./blob-store.ts";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** Throws unless every segment is a plain name and the extension is whitelisted. */
export function assertValidKey(key: string): void {
  const segments = key.split("/");
  const valid =
    key.length <= 512 &&
    segments.every((s) => SEGMENT.test(s) && s !== "." && s !== "..") &&
    contentTypeForKey(key) !== undefined;
  if (!valid) throw new InvalidKeyError(key);
}

/** Prefixes are directory-like: `items/<id>/`. */
export function assertValidPrefix(prefix: string): void {
  const segments = prefix.slice(0, -1).split("/");
  const valid = prefix.endsWith("/") && segments.every((s) => SEGMENT.test(s) && s !== "..");
  if (!valid) throw new InvalidKeyError(prefix);
}

export function contentTypeForKey(key: string): string | undefined {
  const dot = key.lastIndexOf(".");
  return dot === -1 ? undefined : CONTENT_TYPES[key.slice(dot + 1).toLowerCase()];
}

export function extensionForContentType(contentType: string): string | undefined {
  const mime = contentType.split(";")[0]?.trim().toLowerCase();
  return Object.entries(CONTENT_TYPES).find(([, type]) => type === mime)?.[0];
}

export const itemKeys = {
  prefix: (itemId: string) => `items/${itemId}/`,
  original: (itemId: string, position: number, ext: string) => `items/${itemId}/${position}.${ext}`,
  thumb: (itemId: string, position: number) => `items/${itemId}/${position}.thumb.webp`,
};
