import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * Lists every M&M output that has a scene_plan (i.e. is renderable).
 * Used by the /render picker page.
 */
export async function GET() {
  try {
    const rows = await query(`
      SELECT mo.id              AS mm_output_id,
             mo.created_at      AS generated_at,
             sj.id              AS sermon_job_id,
             sj.video_id,
             sj.video_title,
             sj.status          AS job_status,
             c.name             AS church_name,
             jsonb_array_length(COALESCE(mo.scene_plan->'scenes','[]'::jsonb)) AS scene_count,
             (mo.fidelity_report->>'confidenceScore')::int AS fidelity_score
      FROM mm_outputs mo
      JOIN sermon_jobs sj ON sj.id = mo.sermon_job_id
      JOIN churches c     ON c.id = sj.church_id
      WHERE mo.scene_plan IS NOT NULL
        AND jsonb_array_length(COALESCE(mo.scene_plan->'scenes','[]'::jsonb)) > 0
      ORDER BY mo.created_at DESC
      LIMIT 100
    `);
    return NextResponse.json({ outputs: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, outputs: [] }, { status: 500 });
  }
}
