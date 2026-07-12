import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readFile } from "node:fs";
import { resolve } from "node:path";

const localPixelLifeRoot = resolve(process.cwd(), ".local-assets", "pixel-life");

const localPixelLifeAssets = {
  name: "local-pixel-life-assets",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use("/local-assets/pixel-life", (request, response, next) => {
      const file = decodeURIComponent((request.url ?? "").split("?", 1)[0]!).replace(/^\/+/, "");
      if (file !== "office-atlas.json" && file !== "office-atlas.png") {
        next();
        return;
      }

      readFile(resolve(localPixelLifeRoot, file), (error, contents) => {
        if (error) {
          next();
          return;
        }
        response.setHeader(
          "Content-Type",
          file.endsWith(".json") ? "application/json" : "image/png",
        );
        response.end(contents);
      });
    });
  },
};

export default defineConfig({
  plugins: [react(), localPixelLifeAssets],
  build: { outDir: "dist/web", emptyOutDir: false },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    open: true,
    watch: {
      ignored: ["**/art/vendor/ordinary-bumblebee/**"],
    },
    proxy: {
      "/api": "http://127.0.0.1:4317",
      "/ws": { target: "ws://127.0.0.1:4317", ws: true },
    },
  },
});
