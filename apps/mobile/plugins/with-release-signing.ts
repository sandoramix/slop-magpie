import { withAppBuildGradle, type ConfigPlugin } from "expo/config-plugins";

// Release signing comes from env vars so the keystore never lives in the repo (docs/releases.md).
// Without MAGPIE_KEYSTORE_PATH the build keeps Expo's debug signing, which is fine for local builds.
const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") throw new Error("expected a groovy app/build.gradle");
    let gradle = cfg.modResults.contents;
    if (gradle.includes("MAGPIE_KEYSTORE_PATH")) return cfg;

    gradle = gradle.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        release {
            if (System.getenv("MAGPIE_KEYSTORE_PATH")) {
                storeFile file(System.getenv("MAGPIE_KEYSTORE_PATH"))
                storePassword System.getenv("MAGPIE_KEYSTORE_PASSWORD")
                keyAlias System.getenv("MAGPIE_KEY_ALIAS")
                keyPassword System.getenv("MAGPIE_KEY_PASSWORD")
            }
        }`,
    );
    // the release build type is the one that points at the debug config by default
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig System.getenv("MAGPIE_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug`,
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });

export default withReleaseSigning;
