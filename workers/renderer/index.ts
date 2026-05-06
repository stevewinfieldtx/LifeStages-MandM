/**
 * Renderer Worker — The Meaningful Message
 * ═══════════════════════════════════════════════════════════════
 * Always-on worker. Polls Postgres for 'pending' video_renders rows
 * and runs the full slide+TTS+ffmpeg pipeline on each one.
 *
 * Same FOR UPDATE SKIP LOCKED claim pattern as the generator worker;
 * safe for multiple renderer instances.
 */

import { closePool, query, queryOne } from "../../lib/db";
import { runRenderPipeline } from "../../lib/render/pipeline";
import { ScenePlan, SermonAnalysis } from "../../types/mm";

const IDLE_POLL_INTERVAL_MS = 15_000;

type ClaimedRender = {
  id: string;
  mm_output_id: string;
  theme: string;
  voice_id: string;
};

type RenderContext = {
  scene_plan: ScenePlan;
  analysis: SermonAnalysis;
  video_title: string | null;
  church_name: string;
};

async function claimNextRender(): Promise<ClaimedRender | null> {
  return queryOne<ClaimedRender>(
    `UPDATE video_renders
       SET status = 'rendering',
           started_at = NOW(),
           progress_pct = 0,
           current_step = 'starting'
     WHERE id = (
       SELECT id FROM video_renders
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, mm_output_id, theme, voice_id`
  );
}

async function loadContext(mmOutputId: string): Promise<RenderContext | null> {
  return queryOne<RenderContext>(
    `SELECT
       o.scene_plan,
       o.analysis,
       j.video_title,
       c.name AS church_name
     FROM mm_outputs o
     JOIN sermon_jobs j ON j.id = o.sermon_job_id
     JOIN churches c    ON c.id = j.church_id
     WHERE o.id = $1`,
    [mmOutputId]
  );
}

async function reportProgress(
  renderId: string,
  pct: number,
  step: string
): Promise<void> {
  await query(
    `UPDATE video_renders
       SET progress_pct = $1, current_step = $2
     WHERE id = $3`,
    [pct, step, renderId]
  );
}

async function markDone(
  renderId: string,
  outputPath: string,
  durationSec: number
): Promise<void> {
  await query(
    `UPDATE video_renders
       SET status = 'done',
           progress_pct = 100,
           current_step = 'complete',
           output_path = $1,
           duration_sec = $2,
           finished_at = NOW()
     WHERE id = $3`,
    [outputPath, durationSec, renderId]
  );
}

async function markFailed(renderId: string, message: string): Promise<void> {
  await query(
    `UPDATE video_renders
       SET status = 'failed',
           current_step = 'failed',
           error_message = $1,
           finished_at = NOW()
     WHERE id = $2`,
    [message, renderId]
  );
}

async function processRender(claim: ClaimedRender): Promise<void> {
  console.log(`[renderer] processing render ${claim.id}`);
  try {
    const ctx = await loadContext(claim.mm_output_id);
    if (!ctx) {
      throw new Error(`mm_output ${claim.mm_output_id} not found`);
    }
    const result = await runRenderPipeline(
      {
        renderId: claim.id,
        scenePlan: ctx.scene_plan,
        analysis: ctx.analysis,
        videoTitle: ctx.video_title || "Untitled Sermon",
        churchName: ctx.church_name,
        themeId: claim.theme,
        voiceId: claim.voice_id
      },
      async ({ pct, step }) => {
        await reportProgress(claim.id, pct, step);
      }
    );
    await markDone(claim.id, result.outputPath, result.durationSec);
    console.log(
      `[renderer] ✓ render ${claim.id} done in ${result.durationSec}s ` +
      `(${result.sceneCount} scenes)`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[renderer] ✗ render ${claim.id} error:`, msg);
    await markFailed(claim.id, msg);
  }
}

async function runLoop(): Promise<void> {
  console.log("[renderer] starting loop...");

  let shuttingDown = false;
  process.on("SIGTERM", () => {
    console.log("[renderer] SIGTERM received, draining...");
    shuttingDown = true;
  });
  process.on("SIGINT", () => {
    console.log("[renderer] SIGINT received, draining...");
    shuttingDown = true;
  });

  while (!shuttingDown) {
    try {
      const claim = await claimNextRender();
      if (!claim) {
        await new Promise((r) => setTimeout(r, IDLE_POLL_INTERVAL_MS));
        continue;
      }
      await processRender(claim);
    } catch (err) {
      console.error("[renderer] loop error:", err);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  await closePool();
  console.log("[renderer] drained cleanly. exiting.");
  process.exit(0);
}

if (require.main === module) {
  runLoop().catch((err) => {
    console.error("[renderer] fatal:", err);
    process.exit(1);
  });
}
