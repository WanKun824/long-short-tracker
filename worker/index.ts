/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { RefreshAuditError, runPrivateSiteRefresh } from "./cloudScheduler";

type RuntimeEnv = Env & {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: ImagesBinding;
  SITES_REFRESH_URL: string;
  SITES_REFRESH_BEARER_TOKEN: string;
};

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

function imageOutputFormat(format: string): ImageOutputOptions["format"] {
  switch (format) {
    case "image/avif":
    case "image/webp":
    case "image/jpeg":
      return format;
    default:
      return "image/jpeg";
  }
}

const worker = {
  async fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__scheduled") {
      return new Response("Not Found", { status: 404 });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({
            format: imageOutputFormat(format),
            quality,
          });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: RuntimeEnv, ctx: ExecutionContext): Promise<void> {
    const startedAt = Date.now();
    const task = runPrivateSiteRefresh(env, controller.scheduledTime)
      .then((audit) => {
        console.log(JSON.stringify({
          event: "cloud_refresh_succeeded",
          cron: controller.cron,
          scheduledTime: new Date(controller.scheduledTime).toISOString(),
          durationMs: Date.now() - startedAt,
          ...audit,
        }));
      })
      .catch((cause: unknown) => {
        if (cause instanceof RefreshAuditError && cause.noRetry) controller.noRetry();
        console.error(JSON.stringify({
          event: "cloud_refresh_failed",
          cron: controller.cron,
          scheduledTime: new Date(controller.scheduledTime).toISOString(),
          durationMs: Date.now() - startedAt,
          error: cause instanceof Error ? cause.message : "未知错误",
        }));
        throw cause;
      });
    ctx.waitUntil(task);
  },
} satisfies ExportedHandler<RuntimeEnv>;

export default worker;
