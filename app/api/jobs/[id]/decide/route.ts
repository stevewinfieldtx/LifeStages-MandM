import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const schema = z.object({
  action: z.enum(["approved", "rejected", "edited"]),
  reviewerEmail: z.string().email().optional(),
  notes: z.string().optional(),
  editedScript: z.string().optional()
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = schema.parse(await req.json());

    // Insert review record
    await query(
      `INSERT INTO reviews (sermon_job_id, reviewer_email, action, notes, edited_script)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        body.reviewerEmail ?? null,
        body.action,
        body.notes ?? null,
        body.editedScript ?? null
      ]
    );

    // If the reviewer edited, update the stored M&M script too
    if (body.action === "edited" && body.editedScript) {
      await query(
        `UPDATE mm_outputs SET mm_script = $1 WHERE sermon_job_id = $2`,
        [body.editedScript, id]
      );
    }

    const nextStatus =
      body.action === "approved" ? "approved" :
      body.action === "rejected" ? "rejected" :
      "pending_review"; // edited stays pending

    await query(
      `UPDATE sermon_jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
      [nextStatus, id]
    );

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
