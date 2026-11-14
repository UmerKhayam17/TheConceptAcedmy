// TEMPORARY (emulator testing only, safe to delete): same as vite.config.ts but plain HTTP on
// port 8081, because the Android app refuses the dev server's self-signed HTTPS certificate.
import { defineConfig, type PluginOption } from "vite";
import base from "./vite.config";

export default defineConfig((env) => {
  const config = (base as (e: typeof env) => Record<string, any>)(env);
  const plugins = (config.plugins as PluginOption[]).flat(Infinity) as { name?: string }[];
  return {
    ...config,
    server: { ...config.server, https: undefined, port: 8081, strictPort: true },
    plugins: plugins.filter((p) => !p?.name?.includes("basic-ssl")),
  };
});
