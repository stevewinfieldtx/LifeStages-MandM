/**
 * Next.js instrumentation hook — auto-loaded by the Next.js server on
 * boot. We use it to start the embedded render loop so the web service
 * is also responsible for processing video_renders rows.
 *
 * Only runs in the Node runtime (skip Edge/middleware).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Dynamic import so the heavy render deps (sharp, ffmpeg-static,
  // @napi-rs/canvas) only load on the server.
  const { startEmbeddedRenderer } = await import("./lib/render/embedded");
  startEmbeddedRenderer();
}
