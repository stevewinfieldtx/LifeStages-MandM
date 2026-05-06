/**
 * Render loop, factored so it can run either:
 *
 *   (a) Embedded in the Next.js web server (default deploy shape on
 *       Railway — only one Volume needed). Started from
 *       instrumentation.ts when NEXT_RUNTIME === 'nodejs'.
 *
 *   (b) As a standalone worker process (workers/renderer/index.ts),
 *       for if/when render load justifies its own service. Same
 *       FOR UPDATE SKIP LOCKED claim works for either.
 *
 * The actual heavy work (ffmpeg, sharp, ElevenLabs HTTP) happens in
 * subprocesses or async I/O, so running this in the web server's
 * event loop doesn't block request handlers in any meaningful way.
 */

import { closePool, query, queryOne } from "../db";
import { ScenePlan, SermonAnalysis } from "../../types/mm";
import { runRenderPipeline } from "./pipeline";

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

let started = false;
let shuttingDown = false;

async function loopBody(): Promise<void> {
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
}

/**
 * Start the render loop in-process. Idempotent — calling twice is a no-op.
 * No SIGTERM handling here: the host process (Next.js server) handles
 * its own lifecycle; we just stop polling when shuttingDown flips.
 */
export function startEmbeddedRenderer(): void {
  if (started) return;
  started = true;
  if (!process.env.DATABASE_URL) {
    console.warn("[renderer:embedded] DATABASE_URL missing; not starting.");
    started = false;
    return;
  }
  console.log("[renderer:embedded] starting in-process loop");
  loopBody().catch((err) => {
    console.error("[renderer:embedded] loop crashed:", err);
    started = false;
  });
}

/**
 * Standalone worker entrypoint — installs SIGTERM/SIGINT and drains
 * the pool on exit. Used by workers/renderer/index.ts.
 */
export async function runStandaloneLoop(): Promise<void> {
  console.log("[renderer] starting loop (standalone)...");
  process.on("SIGTERM", () => {
    console.log("[renderer] SIGTERM received, draining...");
    shuttingDown = true;
  });
  process.on("SIGINT", () => {
    console.log("[renderer] SIGINT received, draining...");
    shuttingDown = true;
  });
  await loopBody();
  await closePool();
  console.log("[renderer] drained cleanly. exiting.");
  process.exit(0);
}
