import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { THEMES, DEFAULT_THEME } from "@/lib/render/themes";
import { defaultVoiceId, voiceLabel, VOICE_PRESETS } from "@/lib/render/voices";

/**
 * GET — list recent renders (for the picker page sidebar).
 * POST — create a new render row; the renderer worker picks it up.
 */
export async function GET() {
  try {
    const rows = await query(`
      SELECT vr.id, vr.mm_output_id, vr.status, vr.progress_pct, vr.current_step,
             vr.theme, vr.voice_label, vr.duration_sec, vr.error_message,
             vr.created_at, vr.finished_at,
             sj.video_title, c.name AS church_name
      FROM video_renders vr
      JOIN mm_outputs mo  ON mo.id = vr.mm_output_id
      JOIN sermon_jobs sj ON sj.id = mo.sermon_job_id
      JOIN churches c     ON c.id = sj.church_id
      ORDER BY vr.created_at DESC
      LIMIT 50
    `);
    return NextResponse.json({ renders: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, renders: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mmOutputId = String(body?.mm_output_id || "").trim();
    const theme = THEMES[body?.theme as keyof typeof THEMES]?.id || DEFAULT_THEME;
    const voiceId = String(body?.voice_id || defaultVoiceId());

    if (!mmOutputId) {
      return NextResponse.json(
        { error: "mm_output_id is required" },
        { status: 400 }
      );
    }

    const exists = await queryOne(
      `SELECT id FROM mm_outputs WHERE id = $1`,
      [mmOutputId]
    );
    if (!exists) {
      return NextResponse.json(
        { error: "mm_output not found" },
        { status: 404 }
      );
    }

    const knownVoice = VOICE_PRESETS.find((v) => v.id === voiceId);
    const label = knownVoice?.label || voiceLabel(voiceId);

    const created = await queryOne<{ id: string }>(
      `INSERT INTO video_renders
         (mm_output_id, theme, voice_id, voice_label, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [mmOutputId, theme, voiceId, label]
    );

    return NextResponse.json({ id: created!.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
