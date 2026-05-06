import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

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
 *     source?: string,                 // free-form, e.g. "yt-dlp-subs"
 *     church_name?: string,            // defaults to "Inbound Sermons"
 *     church_slug?: string             // defaults to slugified church_name
 *   }
 *
 * Side effects on first push (idempotent on repeat):
 *   1. Upsert transcripts_cache row
 *   2. Ensure churches row exists (default: "Inbound Sermons" / slug "inbound")
 *   3. Ensure channels row exists (placeholder youtube_channel_id="INBOUND-DEFAULT")
 *   4. Ensure sermon_jobs row exists in 'discovered' status (existing status preserved)
 *
 * The generator worker then picks up the discovered job, finds the cached
 * transcript, and runs the full M&M pipeline. No watcher / channel
 * subscription needed.
 */

const INBOUND_CHANNEL_PLACEHOLDER = "INBOUND-DEFAULT";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "inbound";
}

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
  const churchName = body?.church_name
    ? String(body.church_name).trim()
    : "Inbound Sermons";
  const churchSlug = body?.church_slug
    ? slugify(String(body.church_slug))
    : slugify(churchName);

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

  // 1. Cache the transcript
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

  // 2. Upsert church (DO UPDATE noop so RETURNING fires on either path)
  const reviewerEmail =
    process.env.REVIEW_FROM_EMAIL || "stevewinfieldtx@gmail.com";
  const church = await queryOne<{ id: string }>(
    `INSERT INTO churches (name, slug, reviewer_email)
       VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET name = churches.name
     RETURNING id`,
    [churchName, churchSlug, reviewerEmail]
  );
  if (!church) {
    return NextResponse.json(
      { error: "failed to upsert church" },
      { status: 500 }
    );
  }

  // 3. Upsert channel (placeholder — we don't know the real YT channel id from a video push)
  const channel = await queryOne<{ id: string }>(
    `INSERT INTO channels (church_id, youtube_channel_id)
       VALUES ($1, $2)
     ON CONFLICT (church_id, youtube_channel_id)
       DO UPDATE SET youtube_channel_id = channels.youtube_channel_id
     RETURNING id`,
    [church.id, INBOUND_CHANNEL_PLACEHOLDER]
  );
  if (!channel) {
    return NextResponse.json(
      { error: "failed to upsert channel" },
      { status: 500 }
    );
  }

  // 4. Upsert sermon_job in 'discovered' state. ON CONFLICT preserves the
  //    existing status so a re-push doesn't reset a job that's already
  //    been processed / approved / etc.
  const job = await queryOne<{ id: string; status: string }>(
    `INSERT INTO sermon_jobs (church_id, channel_id, video_id, video_title, status)
       VALUES ($1, $2, $3, $4, 'discovered')
     ON CONFLICT (channel_id, video_id) DO UPDATE SET
       video_title = COALESCE(EXCLUDED.video_title, sermon_jobs.video_title),
       updated_at  = NOW()
     RETURNING id, status`,
    [church.id, channel.id, videoId, title]
  );

  return NextResponse.json({
    ok: true,
    video_id: videoId,
    chunk_count: chunks.length,
    sermon_job_id: job?.id,
    sermon_job_status: job?.status,
    church_slug: churchSlug
  });
}
