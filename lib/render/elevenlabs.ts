/**
 * ElevenLabs TTS client.
 * Streams MP3 audio to disk per scene.
 */

import { writeFile } from "node:fs/promises";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export type TtsOptions = {
  text: string;
  voiceId: string;
  outputPath: string;
  modelId?: string;
  // Voice tuning — sensible defaults for narration
  stability?: number;       // 0..1   default 0.5
  similarityBoost?: number; // 0..1   default 0.75
  style?: number;           // 0..1   default 0.0
  useSpeakerBoost?: boolean;
};

export async function synthesizeSpeech(opts: TtsOptions): Promise<{
  bytes: number;
  outputPath: string;
}> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is missing.");
  }

  const modelId = opts.modelId || process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";

  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${opts.voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: modelId,
      voice_settings: {
        stability: opts.stability ?? 0.5,
        similarity_boost: opts.similarityBoost ?? 0.75,
        style: opts.style ?? 0.0,
        use_speaker_boost: opts.useSpeakerBoost ?? true
      }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`ElevenLabs error (${res.status}): ${errorText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(opts.outputPath, buffer);
  return { bytes: buffer.length, outputPath: opts.outputPath };
}
