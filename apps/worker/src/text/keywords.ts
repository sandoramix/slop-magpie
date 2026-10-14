import { STOPWORDS } from "./stopwords.ts";

export interface ExtractedKeyword {
  keyword: string;
  source: "hashtag" | "caption";
  weight: number;
}

const HASHTAG = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,60})/gu;
const WORD = /[\p{L}][\p{L}\p{N}'’-]*[\p{L}\p{N}]|[\p{L}]{2}/gu;

export function normalizeKeyword(word: string): string {
  return word
    .normalize("NFC")
    .toLowerCase()
    .replace(/^['’-]+|['’-]+$/g, "");
}

export function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(HASHTAG)) if (m[1]) out.add(normalizeKeyword(m[1]));
  return [...out];
}

/**
 * Top terms of the text (hashtags, mentions, URLs and stopwords removed), weighted by frequency
 * relative to the most frequent term.
 */
export function extractTerms(text: string, max = 15): { keyword: string; weight: number }[] {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\p{L}\p{N}_.]+/gu, " ");
  const counts = new Map<string, number>();
  for (const m of cleaned.matchAll(WORD)) {
    // strip elisions like l'acqua / dell’olio
    const word = normalizeKeyword(m[0]).replace(/^\p{L}{1,4}['’]/u, "");
    if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
  const top = sorted[0]?.[1] ?? 1;
  // frequency share, floored so single mentions in a short caption still count
  return sorted.map(([keyword, n]) => ({ keyword, weight: Math.round((0.3 + (0.4 * n) / top) * 100) / 100 }));
}

export function extractKeywords(input: { title?: string | null; caption?: string | null }): ExtractedKeyword[] {
  const text = [input.title, input.caption].filter(Boolean).join("\n");
  const hashtags = extractHashtags(text);
  const tagSet = new Set(hashtags);
  return [
    ...hashtags.map((keyword) => ({ keyword, source: "hashtag" as const, weight: 1 })),
    ...extractTerms(text)
      .filter((t) => !tagSet.has(t.keyword))
      .map((t) => ({ ...t, source: "caption" as const })),
  ];
}

/** Display title from a caption: first line, trimmed to a word boundary. */
export function titleFromCaption(caption: string, max = 100): string | null {
  const line = caption
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .find((l) => l.replace(/[#@]\S+/g, "").trim().length > 0);
  if (!line) return null;
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
