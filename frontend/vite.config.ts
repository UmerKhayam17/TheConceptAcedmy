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
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, /^\/socket\.io\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/") ||
              url.pathname.startsWith("/uploads/") ||
              url.pathname.startsWith("/socket.io"),
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: true,
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
