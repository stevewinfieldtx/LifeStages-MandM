/**
 * Render pipeline orchestrator.
 *
 * Given a video_renders row, walks every scene in the M&M scene plan,
 * synthesizes ElevenLabs audio, builds a slide PNG, makes a per-scene
 * MP4, and concats everything into final.mp4. Reports progress through
 * the supplied progress callback so the worker can update the DB row.
 */

import { join } from "node:path";
import { ScenePlan, SermonAnalysis } from "../../types/mm";
import { synthesizeSpeech } from "./elevenlabs";
import {
  buildSceneClip,
  concatClips,
  probeAudioDuration
} from "./ffmpeg";
import {
  renderIntroSlide,
  renderOutroSlide,
  renderSceneSlide
} from "./slides";
import { ensureRenderDirs, finalMp4Path } from "./storage";
import { getTheme, ThemeId } from "./themes";

export type RenderInput = {
  renderId: string;
  scenePlan: ScenePlan;
  analysis: SermonAnalysis;
  videoTitle: string;
  churchName: string;
  themeId: ThemeId | string;
  voiceId: string;
};

export type RenderProgressUpdate = {
  pct: number;
  step: string;
};

export type RenderProgress = (update: RenderProgressUpdate) => Promise<void>;

export type RenderResult = {
  outputPath: string;
  durationSec: number;
  sceneCount: number;
};

function pad(n: number, width = 3): string {
  return String(n).padStart(width, "0");
}

function deriveHeadline(scene: ScenePlan["scenes"][number]): string {
  // Prefer the explicit on-screen text; if it's empty fall back to a
  // shortened version of the narration.
  const onScreen = (scene.onScreenText || "").trim();
  if (onScreen) return onScreen;
  const narration = (scene.narration || "").trim();
  // Take first ~14 words so the slide isn't a wall of text
  const words = narration.split(/\s+/).slice(0, 14);
  return words.join(" ") + (narration.split(/\s+/).length > 14 ? "…" : "");
}

export async function runRenderPipeline(
  input: RenderInput,
  onProgress: RenderProgress
): Promise<RenderResult> {
  const theme = getTheme(input.themeId);
  const { audio, slides, clips } = await ensureRenderDirs(input.renderId);
  const totalScenes = input.scenePlan.scenes.length;
  if (totalScenes === 0) {
    throw new Error("Scene plan contains no scenes — cannot render.");
  }

  const watermark = `${input.churchName} · Meaningful Message`;
  const allClipPaths: string[] = [];
  let totalAudioSec = 0;

  // ─── Intro slide (silent 1.5s) ───────────────────────────────
  await onProgress({ pct: 2, step: "rendering intro slide" });
  const introPng = join(slides, "intro.png");
  await renderIntroSlide({
    outputPath: introPng,
    theme,
    title: input.videoTitle,
    subtitle: input.churchName
  });

  // We need an audio track for the intro too (ffmpeg concat is tidiest
  // when every clip has both video + audio). Generate 1.5s of silence
  // by speaking a single space — ElevenLabs returns near-silent audio
  // and we trust ffmpeg's -shortest. Cheaper alternative: ffmpeg
  // anullsrc, but that means a separate codepath. Keep it uniform.
  const introAudio = join(audio, "intro.mp3");
  await synthesizeSpeech({
    text: ".",
    voiceId: input.voiceId,
    outputPath: introAudio
  });
  const introDur = Math.max(1.2, await probeAudioDuration(introAudio));
  const introClip = join(clips, "intro.mp4");
  await buildSceneClip({
    imagePath: introPng,
    audioPath: introAudio,
    outputPath: introClip,
    durationSec: introDur
  });
  allClipPaths.push(introClip);
  totalAudioSec += introDur;

  // ─── Per-scene loop ─────────────────────────────────────────
  // Reserve 5% for intro/outro, 5% for concat, 90% for scenes.
  const sceneSpan = 90;
  for (let i = 0; i < totalScenes; i++) {
    const scene = input.scenePlan.scenes[i];
    const number = pad(i + 1);
    const sceneNumLabel = `Scene ${i + 1} of ${totalScenes}`;
    const audioPath = join(audio, `scene-${number}.mp3`);
    const slidePath = join(slides, `scene-${number}.png`);
    const clipPath = join(clips, `scene-${number}.mp4`);

    const baselinePct = 5 + (sceneSpan * i) / totalScenes;

    await onProgress({
      pct: Math.round(baselinePct),
      step: `synthesizing voice for scene ${i + 1}/${totalScenes}`
    });
    await synthesizeSpeech({
      text: scene.narration,
      voiceId: input.voiceId,
      outputPath: audioPath
    });

    await onProgress({
      pct: Math.round(baselinePct + (sceneSpan / totalScenes) * 0.4),
      step: `rendering slide for scene ${i + 1}/${totalScenes}`
    });
    await renderSceneSlide({
      outputPath: slidePath,
      theme,
      headline: deriveHeadline(scene),
      scripture: scene.scriptureReference,
      topMeta: sceneNumLabel,
      watermark
    });

    await onProgress({
      pct: Math.round(baselinePct + (sceneSpan / totalScenes) * 0.7),
      step: `building clip for scene ${i + 1}/${totalScenes}`
    });
    const dur = await probeAudioDuration(audioPath);
    await buildSceneClip({
      imagePath: slidePath,
      audioPath: audioPath,
      outputPath: clipPath,
      durationSec: dur
    });
    allClipPaths.push(clipPath);
    totalAudioSec += dur;
  }

  // ─── Outro slide ────────────────────────────────────────────
  await onProgress({ pct: 95, step: "rendering outro slide" });
  const outroPng = join(slides, "outro.png");
  const closing = input.analysis.mainApplication
    ? "Watch the full sermon →"
    : "Watch the full sermon →";
  const footnote = `${input.churchName}`;
  await renderOutroSlide({
    outputPath: outroPng,
    theme,
    closingLine: closing,
    footnote
  });
  const outroAudio = join(audio, "outro.mp3");
  await synthesizeSpeech({
    text: "Watch the full sermon at the link below.",
    voiceId: input.voiceId,
    outputPath: outroAudio
  });
  const outroDur = await probeAudioDuration(outroAudio);
  const outroClip = join(clips, "outro.mp4");
  await buildSceneClip({
    imagePath: outroPng,
    audioPath: outroAudio,
    outputPath: outroClip,
    durationSec: outroDur
  });
  allClipPaths.push(outroClip);
  totalAudioSec += outroDur;

  // ─── Concat ─────────────────────────────────────────────────
  await onProgress({ pct: 97, step: "stitching final video" });
  const out = finalMp4Path(input.renderId);
  await concatClips(allClipPaths, out);

  return {
    outputPath: out,
    durationSec: Math.round(totalAudioSec),
    sceneCount: totalScenes
  };
}
