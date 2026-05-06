import { TranscriptChunk } from "@/types/mm";

export function transcriptChunksToText(chunks: TranscriptChunk[]): string {
  return chunks
    .map((c) => c.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function transcriptPreview(chunks: TranscriptChunk[], maxChars = 2000): string {
  return transcriptChunksToText(chunks).slice(0, maxChars);
}

/**
 * Light touch cleanup. We deliberately keep most of the raw transcript
 * — the LLM boundary step handles the heavy lifting.
 */
export function basicCleanTranscript(text: string): string {
  return text
    .replace(/\[Music\]/gi, "")
    .replace(/\[Applause\]/gi, "")
    .replace(/\[Laughter\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chunk large transcripts for LLM context windows.
 * Church services run 60-90 minutes — that's 15-25k words, ~30-50k tokens raw.
 * With gpt-4.1-mini (128k context) we usually fit the whole thing,
 * but chunking is available for smaller models.
 */
export function chunkTranscript(text: string, maxCharsPerChunk = 40_000): string[] {
  if (text.length <= maxCharsPerChunk) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const end = Math.min(cursor + maxCharsPerChunk, text.length);
    // Try to cut at a sentence boundary
    const slice = text.slice(cursor, end);
    const lastPeriod = slice.lastIndexOf(". ");
    const cut = lastPeriod > maxCharsPerChunk * 0.75 ? cursor + lastPeriod + 1 : end;
    chunks.push(text.slice(cursor, cut).trim());
    cursor = cut;
  }
  return chunks;
}
