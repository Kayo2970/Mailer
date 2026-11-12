import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored from React Bits (reactbits.dev) — kept byte-for-byte so they can be re-synced.
    "src/components/AeroShards.jsx",
    "src/components/GhostFibers.jsx",
    "src/components/SpecularButton.jsx",
    "src/components/PillNav.jsx",
  ]),
]);

export default eslintConfig;
