/**
 * Channel Watcher - The Meaningful Message
 * ===============================================================
 * Runs on a Railway cron schedule (hourly by default).
 *
 * For each active channel:
 *   1. Fetch the latest uploads via YouTube RSS (no API key needed).
 *   2. Skip anything already seen or that doesn't look like a sermon.
 *   3. Insert a sermon_jobs row with status = 'discovered'.
 *
 * The generator worker picks it up from there.
 */

import { query, queryOne, closePool } from "../../lib/db";
import { fetchChannelUploads } from "../../lib/youtube";

function looksLikeSermon(title: string): boolean {
  const lower = title.toLowerCase();

  // Hard excludes — definitely NOT a full-service sermon
  const negative = [
    "#shorts",
    " short",
    "trailer",
    "promo",
    "announcement",
    "livestream countdown",
    "coming soon"
  ];
  if (negative.some((n) => lower.includes(n))) return false;

  // Positive signals — clearly a sermon
  const positive = [
    "sermon",
    "message",
    "sunday service",
    "worship service",
    "preaching",
    "sunday morning",
    "full service",
    "11am service",
    "9am service"
  ];
  if (positive.some((p) => lower.includes(p))) return true;

  // Default: allow it through. The boundary detection step
  // in the generator will tell us if there's no sermon inside.
  return true;
}

export async function runWatcher(): Promise<{
  channelsChecked: number;
  newJobs: number;
}> {
  const channels = await query<{
    id: string;
    church_id: string;
    youtube_channel_id: string;
    last_video_id_seen: string | null;
  }>(
    `SELECT id, church_id, youtube_channel_id, last_video_id_seen
     FROM channels
     WHERE active = TRUE`
  );

  let newJobs = 0;

  for (const ch of channels) {
    try {
      console.log(`[watcher] checking channel ${ch.youtube_channel_id}`);
      const uploads = await fetchChannelUploads(ch.youtube_channel_id);

      // RSS feed returns newest-first.
      // Walk until we hit the last-seen video, then stop.
      for (const video of uploads) {
        if (ch.last_video_id_seen === video.videoId) {
          break;
        }

        if (!looksLikeSermon(video.title)) {
          console.log(`[watcher]   skip (not sermon): ${video.title}`);
          continue;
        }

        const existing = await queryOne(
          `SELECT id FROM sermon_jobs WHERE channel_id = $1 AND video_id = $2`,
          [ch.id, video.videoId]
        );
        if (existing) continue;

        await query(
          `INSERT INTO sermon_jobs
             (church_id, channel_id, video_id, video_title,
              video_published_at, status)
           VALUES ($1, $2, $3, $4, $5, 'discovered')`,
          [
            ch.church_id,
            ch.id,
            video.videoId,
            video.title,
            video.publishedAt || null
          ]
        );

        console.log(`[watcher]   + new job: ${video.title}`);
        newJobs++;
      }

      // Update most-recent-seen to the top of the feed.
      if (uploads[0]) {
        await query(
          `UPDATE channels
             SET last_video_id_seen = $1, last_checked_at = NOW()
             WHERE id = $2`,
          [uploads[0].videoId, ch.id]
        );
      } else {
        await query(
          `UPDATE channels SET last_checked_at = NOW() WHERE id = $1`,
          [ch.id]
        );
      }
    } catch (err) {
      console.error(
        `[watcher] ERROR for channel ${ch.youtube_channel_id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `[watcher] done. channels=${channels.length} new_jobs=${newJobs}`
  );
  return { channelsChecked: channels.length, newJobs };
}

// Run directly via CLI
if (require.main === module) {
  runWatcher()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[watcher] fatal:", err);
      await closePool();
      process.exit(1);
    });
}
