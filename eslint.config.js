// ESLint flat config (eslint v9+).
// Minimal rules to start: lint TypeScript with @typescript-eslint's recommended,
// allow `any` only where intentional (puppeteer + js-dos interop often needs it),
// and keep unused-vars surfaced.
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "coverage/", ".vitest-cache/"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
