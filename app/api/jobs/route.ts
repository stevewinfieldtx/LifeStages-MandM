import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const jobs = await query(`
      SELECT sj.id, sj.video_id, sj.video_title, sj.status, sj.created_at,
             c.name AS church_name
      FROM sermon_jobs sj
      JOIN churches c ON c.id = sj.church_id
      ORDER BY sj.created_at DESC
      LIMIT 100
    `);
    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, jobs: [] }, { status: 500 });
  }
}
