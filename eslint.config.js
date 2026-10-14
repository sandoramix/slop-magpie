// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.expo/**",
      "**/.turbo/**",
      "apps/mobile/android/**",
      "apps/mobile/ios/**",
      "**/drizzle/meta/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": true, "ts-expect-error": "allow-with-description" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: "Read config through the app's src/env.ts (t3-env)." },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // must stay runnable in React Native
    files: ["packages/shared/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["node:*"], message: "packages/shared must not use Node APIs." }] }],
    },
  },
  {
    // the only places allowed to read process.env
    files: ["apps/*/src/env.ts", "packages/*/src/env.ts", "apps/mobile/app.config.ts", "**/*.config.ts", "**/vitest.setup.ts"],
    rules: { "no-restricted-properties": "off" },
  },
);
