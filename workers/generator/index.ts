/**
 * Generation Worker — The Meaningful Message
 * ═══════════════════════════════════════════════════════════════
 * Always-on worker. Polls Postgres for 'discovered' jobs and runs
 * the full M&M pipeline on each one.
 *
 * Uses FOR UPDATE SKIP LOCKED for atomic job claims — safe for
 * multiple worker instances to run in parallel.
 */

import { query, queryOne, closePool } from "../../lib/db";
import { getTranscriptFromYouTube } from "../../lib/youtube";
import { basicCleanTranscript, transcriptChunksToText } from "../../lib/transcript";
import { runMeaningfulMessage } from "../../lib/mm";
import { sendReviewEmail } from "../../lib/email";

const IDLE_POLL_INTERVAL_MS = 30_000;

// Minimum sermon duration: 8 minutes (480 sec).
// Anything shorter is almost certainly not a standalone sermon.
const MIN_SERMON_DURATION_SEC = 8 * 60;

// Minimum transcript character count after basic cleanup.
// Live streams with no spoken sermon content often result in
// very sparse captions (just [Music] stripped away).
const MIN_TRANSCRIPT_CHARS = 500;

type ClaimedJob = {
    id: string;
    video_id: string;
    church_id: string;
    video_title: string | null;
};

async function claimNextJob(): Promise<ClaimedJob | null> {
    return queryOne<ClaimedJob>(
          `UPDATE sermon_jobs
               SET status = 'transcribing', updated_at = NOW()
                    WHERE id = (
                           SELECT id FROM sermon_jobs
                                  WHERE status = 'discovered'
                                         ORDER BY created_at ASC
                                                LIMIT 1
                                                       FOR UPDATE SKIP LOCKED
                                                            )
                                                                 RETURNING id, video_id, church_id, video_title`
        );
}

async function markStatus(
    jobId: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    await query(
          `UPDATE sermon_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`,
          [status, errorMessage ?? null, jobId]
        );
}

async function processJob(job: ClaimedJob): Promise<void> {
    console.log(`[generator] processing job ${job.id}: "${job.video_title}"`);

  try {
        // ─── Pull transcript from YouTube ───
      const videoUrl = `https://www.youtube.com/watch?v=${job.video_id}`;
        const source = await getTranscriptFromYouTube(videoUrl);

      // ─── Store duration now that we have it ───
      if (source.durationSec !== null) {
              await query(
                        `UPDATE sermon_jobs SET video_duration_sec = $1 WHERE id = $2`,
                        [source.durationSec, job.id]
                      );
      }

      // ─── Duration gate: skip videos that are too short to be a sermon ───
      // This catches shorts, trailers, and music videos that slipped past
      // the watcher's title filter.
      if (source.durationSec !== null && source.durationSec < MIN_SERMON_DURATION_SEC) {
              const mins = Math.round(source.durationSec / 60);
              throw new Error(
                        `Video is only ${mins} min long — too short to contain a sermon (minimum ${MIN_SERMON_DURATION_SEC / 60} min).`
                      );
      }

      const rawTranscript = transcriptChunksToText(source.chunks);
        const cleaned = basicCleanTranscript(rawTranscript);

      console.log(
              `[generator] transcript: ${cleaned.length} chars, duration: ${source.durationSec ?? "unknown"}s, ` +
              `live/replay: ${source.isLiveOrReplay}`
            );

      if (cleaned.length < MIN_TRANSCRIPT_CHARS) {
              // For live streams with very sparse captions, surface a clearer error.
          const hint = source.isLiveOrReplay
                ? "This appears to be a live stream with no usable captions. " +
                      "YouTube sometimes doesn't auto-caption live streams, or the captions " +
                      "only contain music markers. A dedicated sermon clip would work better."
                    : "Transcript is too short to be a sermon.";
              throw new Error(hint);
      }

      await markStatus(job.id, "analyzing");

      // ─── Look up church for naming ───
      const church = await queryOne<{ name: string; reviewer_email: string }>(
              `SELECT name, reviewer_email FROM churches WHERE id = $1`,
              [job.church_id]
            );

      // ─── Run the M&M pipeline ───
      await markStatus(job.id, "generating");
        const mm = await runMeaningfulMessage({
                transcript: cleaned,
                targetMinutes: 10,
                churchName: church?.name
        });

      // ─── Store the output ───
      await query(
              `INSERT INTO mm_outputs
                       (sermon_job_id, raw_transcript, sermon_only_text, analysis,
                                 mm_script, scene_plan, publish_kit, fidelity_report,
                                           model_used, tokens_in, tokens_out, cost_usd)
                                                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                        job.id,
                        rawTranscript,
                        mm.sermonOnlyText,
                        JSON.stringify(mm.analysis),
                        mm.mmScript,
                        JSON.stringify(mm.scenePlan),
                        JSON.stringify(mm.publishKit),
                        JSON.stringify(mm.fidelityReport),
                        mm.usage.model,
                        mm.usage.tokensIn,
                        mm.usage.tokensOut,
                        mm.usage.costUsd
                      ]
            );

      await markStatus(job.id, "pending_review");

      // ─── Notify the reviewer ───
      if (church) {
              await sendReviewEmail({
                        to: church.reviewer_email,
                        churchName: church.name,
                        jobId: job.id,
                        sermonTitle: job.video_title ?? undefined
              });
      }

      console.log(
              `[generator] ✓ job ${job.id} ready for review ` +
              `(cost: $${mm.usage.costUsd.toFixed(4)}, ` +
              `fidelity: ${mm.fidelityReport.confidenceScore}/100)`
            );
  } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[generator] ✗ job ${job.id} error:`, msg);
        await markStatus(job.id, "error", msg);
  }
}

async function runLoop(): Promise<void> {
    console.log("[generator] starting loop...");

  let shuttingDown = false;

  process.on("SIGTERM", () => {
        console.log("[generator] SIGTERM received, draining...");
        shuttingDown = true;
  });

  process.on("SIGINT", () => {
        console.log("[generator] SIGINT received, draining...");
        shuttingDown = true;
  });

  while (!shuttingDown) {
        try {
                const job = await claimNextJob();
                if (!job) {
                          await new Promise((r) => setTimeout(r, IDLE_POLL_INTERVAL_MS));
                          continue;
                }
                await processJob(job);
        } catch (err) {
                console.error("[generator] loop error:", err);
                await new Promise((r) => setTimeout(r, 5_000));
        }
  }

  await closePool();
    console.log("[generator] drained cleanly. exiting.");
    process.exit(0);
}

if (require.main === module) {
    runLoop().catch((err) => {
          console.error("[generator] fatal:", err);
          process.exit(1);
    });
}
