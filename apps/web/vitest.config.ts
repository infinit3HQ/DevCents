import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "url";
import viteTsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";

// Standalone test config that skips the TanStack Start + Nitro plugins,
// which collide with vitest's dev server (the nitro plugin tries to
// register an `onMessage` handler against an environment vitest doesn't
// provide). This config is sufficient for pure-logic unit tests under
// src/lib/.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    viteReact(),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
