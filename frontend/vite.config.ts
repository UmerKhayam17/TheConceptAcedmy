import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
  plugins: [
    basicSsl(),
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["favicon.png", "favicon.ico", "icons/apple-touch-icon.png"],
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
        background_color: "#0E2A4E",
        theme_color: "#0E2A4E",
        categories: ["education"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // index.html is not precached: page loads go network-first (below) so a new
        // deploy shows up on the next open instead of after a background update.
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
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
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
