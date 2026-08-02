import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: (wranglerConfig) => ({
          main: "./worker/index.ts",
          ...(!wranglerConfig.compatibility_flags?.includes("nodejs_compat")
            ? { compatibility_flags: ["nodejs_compat"] }
            : {}),
          ...(d1 &&
          !wranglerConfig.d1_databases?.some(
            (database) => database.binding === d1,
          )
            ? {
                d1_databases: [
                  {
                    binding: d1,
                    database_name: "site-creator-d1",
                    database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
                  },
                ],
              }
            : {}),
          ...(r2 &&
          !wranglerConfig.r2_buckets?.some((bucket) => bucket.binding === r2)
            ? {
                r2_buckets: [
                  {
                    binding: r2,
                    bucket_name: "site-creator-r2",
                  },
                ],
              }
            : {}),
        }),
      }),
    ],
  };
});
