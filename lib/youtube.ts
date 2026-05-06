import { TranscriptChunk } from "../types/mm";
import { queryOne } from "./db";

// ─── Video URL parsing ─────────────────────────────────────────

export function extractVideoId(input: string): string {
  try {
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      if (id) return id;
    }
    const id = url.searchParams.get("v");
    if (id) return id;
    // Handle /embed/VIDEOID and /shorts/VIDEOID
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2 && (pathParts[0] === "embed" || pathParts[0] === "shorts")) {
      return pathParts[1];
    }
  } catch {
    // Fall through
  }
  // Maybe they just passed the bare ID
  if (/^[A-Za-z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }
  throw new Error(`Invalid YouTube URL or ID: ${input}`);
}

// ─── Transcript retrieval (cache-only) ──────────────────────────
// M&M no longer fetches transcripts directly — YouTube has aggressively
// closed every free unauthenticated path. Instead, an upstream ingestor
// (TDE; see TargetedDecomposition/src/ingest/youtube.js) does the heavy
// lifting (yt-dlp / watch-page / Groq Whisper) and POSTs the result to
// /api/transcripts/inbound, which lands a row in `transcripts_cache`.
//
// This function reads from that cache and throws a TranscriptNotCached
// error if the row isn't there yet, signaling the caller to defer the
// job rather than mark it failed.

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u002F/g, "/")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export class TranscriptNotCached extends Error {
  videoId: string;
  constructor(videoId: string) {
    super(`No transcript cached for video ${videoId}. Push it via /api/transcripts/inbound (TDE does this automatically).`);
    this.name = "TranscriptNotCached";
    this.videoId = videoId;
  }
}

type TranscriptCacheRow = {
  video_title: string | null;
  chunks: TranscriptChunk[];
  source: string | null;
};

export async function getTranscriptFromYouTube(input: string): Promise<{
  videoId: string;
  title: string;
  transcriptTitle?: string;
  chunks: TranscriptChunk[];
}> {
  const videoId = extractVideoId(input);
  const row = await queryOne<TranscriptCacheRow>(
    `SELECT video_title, chunks, source FROM transcripts_cache WHERE youtube_video_id = $1`,
    [videoId]
  );
  if (!row) {
    throw new TranscriptNotCached(videoId);
  }
  return {
    videoId,
    title: row.video_title || videoId,
    transcriptTitle: row.source ?? undefined,
    chunks: row.chunks
  };
}

// ─── Channel RSS feed (for the watcher) ────────────────────────

export type ChannelUpload = {
  videoId: string;
  title: string;
  publishedAt: string;
};

/**
 * Fetch the 15 most recent uploads for a channel.
 * Uses YouTube's public RSS feed — no API key, no quotas.
 */
export async function fetchChannelUploads(youtubeChannelId: string): Promise<ChannelUpload[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store"
  } as RequestInit);
  if (!res.ok) {
    throw new Error(`Channel RSS fetch failed for ${youtubeChannelId}: ${res.status}`);
  }
  const xml = await res.text();

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entries
    .map((entry) => {
      const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? "";
      const titleRaw = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
      const published = entry.match(/<published>(.*?)<\/published>/)?.[1] ?? "";
      return {
        videoId,
        title: decodeHtmlEntities(titleRaw).trim(),
        publishedAt: published
      };
    })
    .filter((v) => v.videoId);
}
