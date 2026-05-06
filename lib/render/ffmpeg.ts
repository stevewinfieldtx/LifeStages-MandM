/**
 * ffmpeg helpers — uses bundled ffmpeg-static so Railway doesn't need
 * to install ffmpeg via apt. Two operations:
 *
 *   1. probeAudioDuration(mp3): seconds of audio
 *   2. buildSceneClip(image, audio, out): one MP4 per scene, with a
 *      gentle 0.15s fade in/out on video (and matching audio fade).
 *   3. concatClips(parts[], out): stitch per-scene MP4s into final.mp4
 *      using the concat demuxer. Hard cuts but the per-clip fades
 *      make the boundary look soft. Re-encodes once for safety.
 */

import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);
}

const FRAME_RATE = 30;
const FADE_DURATION = 0.15; // seconds of video/audio fade per clip end

export function probeAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, data) => {
      if (err) return reject(err);
      const seconds = data?.format?.duration;
      if (typeof seconds !== "number" || seconds <= 0) {
        return reject(new Error(`Could not probe duration of ${audioPath}`));
      }
      resolve(seconds);
    });
  });
}

export type BuildClipInput = {
  imagePath: string;
  audioPath: string;
  outputPath: string;
  durationSec: number;
};

export function buildSceneClip(input: BuildClipInput): Promise<string> {
  return new Promise((resolve, reject) => {
    const fadeOutStart = Math.max(0, input.durationSec - FADE_DURATION);
    ffmpeg()
      .input(input.imagePath)
      .inputOptions(["-loop 1", `-framerate ${FRAME_RATE}`])
      .input(input.audioPath)
      .complexFilter([
        // Pad to even dimensions for x264, scale down to 1080×1080 for output
        `[0:v]scale=1080:1080,format=yuv420p,fade=t=in:st=0:d=${FADE_DURATION},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE_DURATION}[v]`,
        `[1:a]afade=t=in:st=0:d=${FADE_DURATION},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE_DURATION}[a]`
      ])
      .outputOptions([
        "-map [v]",
        "-map [a]",
        `-r ${FRAME_RATE}`,
        "-c:v libx264",
        "-preset veryfast",
        "-crf 20",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-ar 44100",
        "-shortest",
        "-movflags +faststart"
      ])
      .duration(input.durationSec)
      .on("error", reject)
      .on("end", () => resolve(input.outputPath))
      .save(input.outputPath);
  });
}

/**
 * Concatenate multiple MP4s with the concat demuxer. All inputs must
 * share the same codec/timebase (which they do, since we built them
 * uniformly above). Re-encodes once for stable timestamps.
 */
export async function concatClips(parts: string[], outputPath: string): Promise<string> {
  if (parts.length === 0) throw new Error("concatClips: no parts to concat");

  const concatListPath = join(dirname(outputPath), "concat.txt");
  // ffconcat list format: one `file '...'` per line
  const listBody = parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(concatListPath, listBody, "utf8");

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-crf 20",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-ar 44100",
        "-movflags +faststart"
      ])
      .on("error", reject)
      .on("end", () => resolve(outputPath))
      .save(outputPath);
  });
}
