const EDGE_PUNCTUATION = /^['’-]+|['’-]+$/g;

/**
 * One spelling for a keyword, so `slow_cooker`, `#SlowCooker` and "slow  cooker" are the same term:
 * NFC, lower case, leading `#` dropped, underscores and runs of spaces become a single space.
 * `camel` also splits `slowCooker` at lower-to-upper boundaries; only for hashtags, where people write
 * phrases that way (`iPhone` stays whole because a split needs two lower-case letters before the capital).
 */
export function canonicalKeyword(raw: string, options: { camel?: boolean } = {}): string {
  let text = raw.normalize("NFC").trim().replace(/^#+/, "");
  if (options.camel) text = text.replace(/(\p{Ll}{2,}|\p{N})(\p{Lu})/gu, "$1 $2");
  return text.toLowerCase().replace(/_+/g, " ").replace(/\s+/g, " ").trim().replace(EDGE_PUNCTUATION, "");
}
