import type { SourceFetcher } from "./types.ts";

export const instagram: SourceFetcher = {
  id: "instagram",
  // instaloader keeps its own logged-in session (INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD) and covers posts, carousels
  // and reels; without credentials it steps aside for yt-dlp (reels) and gallery-dl (posts) with the manual cookie file.
  // instagram-embed reads the public embed page without a login, so a carousel keeps all its pictures when the session is dead;
  // opengraph is the last resort when every login is dead: Instagram serves caption, author and a preview image to
  // link-preview crawlers without a session. The result is a `link` item that session-check re-fetches once the session is back.
  strategies: ["instaloader", "yt-dlp", "gallery-dl", "instagram-embed", "opengraph"],
  options: { pageUserAgent: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
};
