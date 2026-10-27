import { canonicalKeyword } from "@magpie/shared/text";
import { STOPWORDS } from "./stopwords.ts";

export interface ExtractedKeyword {
  keyword: string;
  source: "hashtag" | "caption";
  weight: number;
}

const HASHTAG = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,60})/gu;
const WORD = /[\p{L}][\p{L}\p{N}'’-]*[\p{L}\p{N}]|[\p{L}]{2}/gu;

export const normalizeKeyword = canonicalKeyword;

/** Hashtags in their canonical spelling: `#SlowCooker` and `#slow_cooker` both give "slow cooker". */
export function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(HASHTAG)) if (m[1]) out.add(canonicalKeyword(m[1], { camel: true }));
  return [...out].filter((k) => k !== "");
}

/** "recipes" counts as "recipe" when both appear, so one idea is not split into two weak terms. */
function mergePlurals(counts: Map<string, number>): void {
  for (const [word, n] of [...counts]) {
    if (word.length > 4 && word.endsWith("s") && counts.has(word.slice(0, -1))) {
      const single = word.slice(0, -1);
      counts.set(single, (counts.get(single) ?? 0) + n);
      counts.delete(word);
    }
  }
}

/**
 * Top terms of the text (hashtags, mentions, URLs and stopwords removed), weighted by frequency
 * relative to the most frequent term. Two-word phrases that repeat ("slow cooker") are terms too.
 */
export function extractTerms(text: string, max = 15): { keyword: string; weight: number }[] {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\p{L}\p{N}_.]+/gu, " ");
  const counts = new Map<string, number>();
  const phrases = new Map<string, number>();
  // a phrase never spans punctuation, so "pasta. Cooker" is not a bigram
  for (const segment of cleaned.split(/[.!?,;:\n()]+/)) {
    let previous: string | null = null;
    for (const m of segment.matchAll(WORD)) {
      // strip elisions like l'acqua / dell’olio
      const word = canonicalKeyword(m[0]).replace(/^\p{L}{1,4}['’]/u, "");
      if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) {
        previous = null;
        continue;
      }
      counts.set(word, (counts.get(word) ?? 0) + 1);
      if (previous) phrases.set(`${previous} ${word}`, (phrases.get(`${previous} ${word}`) ?? 0) + 1);
      previous = word;
    }
  }
  mergePlurals(counts);
  for (const [phrase, n] of phrases) if (n >= 2) counts.set(phrase, n);
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
