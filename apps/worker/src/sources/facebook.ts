import type { SourceFetcher } from "./types.ts";

// most Facebook videos need a logged-in cookies file (COOKIES_DIR/facebook.txt or the admin screen); without one the page preview is kept
export const facebook: SourceFetcher = {
  id: "facebook",
  strategies: ["yt-dlp", "opengraph"],
  options: { pageUserAgent: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
};
