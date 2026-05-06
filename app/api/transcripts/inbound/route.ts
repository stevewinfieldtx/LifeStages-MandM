import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * Inbound transcript webhook. TDE (or any other ingestor) POSTs here
 * after pulling a YouTube transcript. Authenticated with a shared
 * Bearer token in the INGEST_TOKEN env var.
 *
 * Body shape:
 *   {
 *     youtube_video_id: string,        // 11-char YT ID
 *     video_title?: string,
 *     chunks: Array<{ text: string, start: number, dur: number }>,
 *     source?: string                  // free-form, e.g. "yt-dlp-subs"
 *   }
 *
 * Idempotent — re-pushing the same video_id upserts.
 */
export async function POST(req: Request) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "INGEST_TOKEN is not configured on this server" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const videoId = String(body?.youtube_video_id || "").trim();
  const title = body?.video_title ? String(body.video_title) : null;
  const source = body?.source ? String(body.source) : null;
  const chunks = body?.chunks;

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json(
      { error: "youtube_video_id must be an 11-char YT ID" },
      { status: 400 }
    );
  }
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return NextResponse.json(
      { error: "chunks must be a non-empty array" },
      { status: 400 }
    );
  }
  // Lightweight shape check on first chunk
  const sample = chunks[0];
  if (
    typeof sample?.text !== "string" ||
    typeof sample?.start !== "number" ||
    typeof sample?.dur !== "number"
  ) {
    return NextResponse.json(
      { error: "each chunk needs { text:string, start:number, dur:number }" },
      { status: 400 }
    );
  }

  await query(
    `INSERT INTO transcripts_cache
       (youtube_video_id, video_title, chunks, source, fetched_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (youtube_video_id) DO UPDATE SET
       video_title = COALESCE(EXCLUDED.video_title, transcripts_cache.video_title),
       chunks      = EXCLUDED.chunks,
       source      = COALESCE(EXCLUDED.source, transcripts_cache.source),
       fetched_at  = NOW()`,
    [videoId, title, JSON.stringify(chunks), source]
  );

  return NextResponse.json({ ok: true, video_id: videoId, chunk_count: chunks.length });
}
