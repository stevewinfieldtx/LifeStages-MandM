/**
 * Storage paths for the renderer.
 *
 * Production (Railway): RENDER_DATA_DIR=/data, mounted as a Volume on
 *   both the `web` and `renderer` services so the worker can write and
 *   the API can stream.
 * Local dev: falls back to ./data in the project root.
 *
 * Layout per render:
 *   {root}/renders/{render_id}/
 *     audio/scene-001.mp3      — ElevenLabs TTS per scene
 *     slides/scene-001.png     — rendered slide PNG per scene
 *     clips/scene-001.mp4      — image+audio per scene
 *     concat.txt               — ffmpeg concat list
 *     final.mp4                — the deliverable
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export function dataRoot(): string {
  return process.env.RENDER_DATA_DIR || join(process.cwd(), "data");
}

export function renderDir(renderId: string): string {
  return join(dataRoot(), "renders", renderId);
}

export function finalMp4Path(renderId: string): string {
  return join(renderDir(renderId), "final.mp4");
}

export async function ensureRenderDirs(renderId: string): Promise<{
  root: string;
  audio: string;
  slides: string;
  clips: string;
}> {
  const root = renderDir(renderId);
  const audio = join(root, "audio");
  const slides = join(root, "slides");
  const clips = join(root, "clips");
  for (const dir of [root, audio, slides, clips]) {
    await mkdir(dir, { recursive: true });
  }
  return { root, audio, slides, clips };
}
