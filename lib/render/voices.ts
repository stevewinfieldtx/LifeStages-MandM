/**
 * ElevenLabs voice presets exposed in the GUI dropdown.
 * The IDs are stable public ElevenLabs voice IDs.
 */

export type VoicePreset = {
  id: string;
  label: string;
  description: string;
};

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    label: "Rachel (warm, conversational)",
    description: "American female. Default. Approachable and clear."
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    label: "Adam (deep, narrative)",
    description: "American male. Confident, documentary feel."
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    label: "Bella (soft, intimate)",
    description: "American female. Quieter, devotional tone."
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    label: "Antoni (engaged, modern)",
    description: "American male. Friendly, podcast-style delivery."
  },
  {
    id: "VR6AewLTigWG4xSOukaG",
    label: "Arnold (authoritative, preacher)",
    description: "American male. Strong, declarative — closest to a pulpit voice."
  }
];

export function defaultVoiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || VOICE_PRESETS[0].id;
}

export function voiceLabel(id: string): string {
  return VOICE_PRESETS.find((v) => v.id === id)?.label ?? id;
}
