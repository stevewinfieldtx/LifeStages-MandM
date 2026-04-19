import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await queryOne(`
      SELECT sj.id, sj.video_id, sj.video_title, sj.status, sj.created_at,
             sj.error_message,
             mo.analysis, mo.mm_script, mo.scene_plan, mo.publish_kit,
             mo.fidelity_report, mo.sermon_only_text,
             mo.tokens_in, mo.tokens_out, mo.cost_usd, mo.model_used,
             c.name AS church_name, c.reviewer_email
      FROM sermon_jobs sj
      LEFT JOIN mm_outputs mo ON mo.sermon_job_id = sj.id
      JOIN churches c ON c.id = sj.church_id
      WHERE sj.id = $1
    `, [id]);

    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
