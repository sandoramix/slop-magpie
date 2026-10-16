import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";

const root = join(process.cwd(), "..", "..");

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);

// Released entries only; the app validates the shape with `Changelog` from @magpie/shared/changelog.
const changelog = (JSON.parse(
  execFileSync(process.execPath, [join(root, "scripts", "changelog.ts"), "json"], { encoding: "utf8" }),
) as { version: string }[]).filter((e) => e.version !== "Unreleased");

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Magpie",
  slug: "magpie",
  scheme: "magpie",
  version,
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  android: {
    package: "dev.sandoramix.magpie",
    versionCode: major * 10000 + minor * 100 + patch,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#7c3aed",
    },
  },
  ios: {
    bundleIdentifier: "dev.sandoramix.magpie",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-image",
    "expo-video",
    ["expo-splash-screen", { backgroundColor: "#7c3aed", image: "./assets/adaptive-icon.png", imageWidth: 160 }],
    [
      "expo-build-properties",
      // the API may sit behind plain http on a LAN while testing
      { android: { usesCleartextTraffic: true } },
    ],
    ["expo-share-intent", { androidIntentFilters: ["text/*"], disableIOS: true }],
    "./plugins/with-release-signing.ts",
  ],
  experiments: { typedRoutes: true },
  extra: { changelog, githubRepo: "sandoramix/slop-magpie" },
});
