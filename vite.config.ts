import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";


import { cloudflare } from "@cloudflare/vite-plugin";


const host = process.env.TAURI_DEV_HOST;

// Strip ONNX Runtime WASM from dist — workers load it from CDN at runtime
function stripOnnxWasm(): Plugin {
  return {
    name: "strip-onnx-wasm",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const key of Object.keys(bundle)) {
        if (key.endsWith(".wasm")) {
          delete bundle[key];
        }
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [react(), stripOnnxWasm(), cloudflare()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@features": fileURLToPath(new URL("./src/features", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1421,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    target: ["es2021", "chrome100", "safari15"],
    minify: "esbuild",
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("@tauri-apps")) {
            return "tauri";
          }
        },
      },
    },
    worker: {
      format: "es",
    },
  },
}));