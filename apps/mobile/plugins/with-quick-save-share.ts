import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AndroidConfig, withAndroidManifest, withDangerousMod, type ConfigPlugin } from "expo/config-plugins";

// A second entry in Android's share sheet: "Magpie: save for later". An activity-alias cannot tell the
// app which entry was tapped, so the entry is a tiny activity that forwards the shared content to
// MainActivity with a marker in EXTRA_TITLE (expo-share-intent hands that to JS as `meta.title`).
// Keep MARKER in sync with QUICK_SAVE_MARKER in lib/share.ts.
const MARKER = "magpie:later";
const ACTIVITY = "QuickSaveActivity";
const LABEL = "Magpie: save for later";

const kotlin = (pkg: string) => `package ${pkg}

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** Second share target: forwards the share to MainActivity, marked so the app only saves it to the Inbox. */
class ${ACTIVITY} : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val forward = Intent(intent).apply {
      setClass(this@${ACTIVITY}, MainActivity::class.java)
      putExtra(Intent.EXTRA_TITLE, "${MARKER}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    startActivity(forward)
    finish()
  }
}
`;

const withQuickSaveShare: ConfigPlugin = (config) => {
  const pkg = config.android?.package;
  if (!pkg) throw new Error("android.package is required for the quick-save share target");

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const activities = app.activity ?? [];
    if (!activities.some((a) => a.$["android:name"] === `.${ACTIVITY}`)) {
      activities.push({
        $: {
          "android:name": `.${ACTIVITY}`,
          "android:label": LABEL,
          "android:exported": "true",
          "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
          "android:excludeFromRecents": "true",
          "android:taskAffinity": "",
          "android:noHistory": "true",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.intent.action.SEND" } }],
            category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
            data: [{ $: { "android:mimeType": "text/*" } }],
          },
        ],
      });
      app.activity = activities;
    }
    return cfg;
  });

  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const dir = join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "java", ...pkg.split("."));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${ACTIVITY}.kt`), kotlin(pkg));
      return cfg;
    },
  ]);
};

export default withQuickSaveShare;
