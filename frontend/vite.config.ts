import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { componentTagger } from "lovable-tagger";

/**
 * Writes a gzip (.gz) and brotli (.br) copy next to every text file in dist/, so the
 * server can send the small copy straight away (nginx: gzip_static / brotli_static).
 * Only adds files; the original files are untouched.
 */
const precompressPlugin = () => {
  let outDir = "dist";
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
  return {
    name: "precompress-assets",
    apply: "build" as const,
    configResolved(config: { root: string; build: { outDir: string } }) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      sequential: true,
      order: "post" as const,
      handler() {
        if (!fs.existsSync(outDir)) return;
        for (const file of walk(outDir)) {
          if (!/\.(js|mjs|css|html|json|svg|webmanifest|txt|xml)$/i.test(file)) continue;
          const data = fs.readFileSync(file);
          if (data.length < 1024) continue;
          fs.writeFileSync(`${file}.gz`, zlib.gzipSync(data, { level: 9 }));
          fs.writeFileSync(
            `${file}.br`,
            zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }),
          );
        }
      },
    },
  };
};

// Unique id per build. The running app polls /version.json and reloads when it changes.
const BUILD_ID = new Date().toISOString();

const versionFilePlugin = () => ({
  name: "app-version-file",
  apply: "build" as const,
  generateBundle(this: { emitFile: (file: { type: "asset"; fileName: string; source: string }) => void }) {
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: JSON.stringify({ buildId: BUILD_ID }),
    });
  },
});

// https://vitejs.dev/config/
// HTTPS is required so webcam (getUserMedia) works on LAN IPs, not only localhost.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    https: true,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        xfwd: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Do not force-split recharts/d3 — that creates circular chunks
          // ("Cannot access 'S' before initialization" in production).
          if (id.includes("socket.io")) return "socket";
          if (id.includes("@tanstack/react-query")) return "query";
          if (id.includes("react-router")) return "router";
          if (id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
          if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("vaul")) return "ui";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("date-fns") || id.includes("zod") || id.includes("axios")) return "utils";
        },
      },
    },
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    versionFilePlugin(),
    basicSsl(),
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      // Manifest icons are big PNGs; don't precache them (the browser fetches them itself).
      includeManifestIcons: false,
      includeAssets: [
        "favicon.png",
        "favicon.ico",
        "apple-touch-icon.png",
        "icons/apple-touch-icon.png",
        "icons/apple-touch-icon-167.png",
        "icons/apple-touch-icon-152.png",
        "icons/apple-touch-icon-120.png",
        "splash.jpg",
      ],
      manifest: {
        id: "/",
        name: "The Concept Academy",
        short_name: "TCA",
        description: "The Concept Academy portal for staff, students, and families.",
        lang: "en",
        start_url: "/login",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: "#041e6e",
        categories: ["education"],
        icons: [
          { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // index.html is not precached: page loads go network-first (below) so a new
        // deploy shows up on the next open instead of after a background update.
        // Only app code is cached in the background on first visit (was ~7.8 MB incl. big
        // images). Images and the heavy PDF/export libraries load normally when needed.
        // Only the code every screen needs is downloaded up front. Each other screen's code is
        // saved the first time it is opened (the "app-chunks" rule below), so the first launch
        // no longer downloads the whole app (~3.4 MB) in the background.
        globPatterns: [
          "assets/index-*.{js,css}",
          "assets/{react-vendor,router,query,ui,icons,utils,socket}-*.js",
          "**/*.{ico,svg,woff2}",
        ],
        globIgnores: ["**/jspdf*.js", "**/html2canvas*.js", "**/index.es-*.js", "**/purify.es-*.js"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Ensure browsers revalidate the service worker script after deploy
        navigationPreload: false,
        runtimeCaching: [
          {
            // App shell: always try the server first; fall back to the last copy offline.
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" &&
              !url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/uploads/") &&
              !url.pathname.startsWith("/socket.io"),
            handler: "NetworkFirst",
            options: {
              cacheName: "app-shell",
              networkTimeoutSeconds: 4,
              // Skip the browser/CDN HTTP cache so a stale index.html is never served.
              fetchOptions: { cache: "no-cache" },
              plugins: [
                {
                  // Every SPA route is the same index.html; store one copy for offline use.
                  cacheKeyWillBeUsed: async () => "/index.html",
                },
              ],
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/") ||
              url.pathname.startsWith("/uploads/") ||
              url.pathname.startsWith("/socket.io"),
            handler: "NetworkOnly",
          },
          {
            // Screen code (file names change on every build, so a saved copy never goes stale).
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/.+\.(js|css)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "app-chunks",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Keep PWA off in `vite`/`vite build --mode development` for faster local loads.
      devOptions: {
        enabled: false,
        type: "module",
        navigateFallback: "index.html",
      },
    }),
    precompressPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
