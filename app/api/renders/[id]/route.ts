import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const render = await queryOne(`
      SELECT vr.id, vr.mm_output_id, vr.status, vr.progress_pct, vr.current_step,
             vr.theme, vr.voice_id, vr.voice_label,
             vr.duration_sec, vr.error_message,
             vr.created_at, vr.started_at, vr.finished_at,
             sj.video_title, sj.video_id AS youtube_video_id,
             c.name AS church_name
      FROM video_renders vr
      JOIN mm_outputs mo  ON mo.id = vr.mm_output_id
      JOIN sermon_jobs sj ON sj.id = mo.sermon_job_id
      JOIN churches c     ON c.id = sj.church_id
      WHERE vr.id = $1
    `, [id]);

    if (!render) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(render);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
