import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL("./index.html", import.meta.url)),
        adapters: fileURLToPath(new URL("./src/adapters/index.ts", import.meta.url)),
      },
      preserveEntrySignatures: "strict",
    },
  },
  resolve: {
    alias: {
      "@modern4e/shared": fileURLToPath(new URL("../shared/build/dist/js/productionLibrary/character-builder-shared.mjs", import.meta.url)),
    },
  },
  server: { fs: { allow: [".."] } },
  test: { environment: "node", exclude: ["browser/**", "node_modules/**"] },
});
