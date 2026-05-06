import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTranscriptFromYouTube } from "@/lib/youtube";
import { basicCleanTranscript, transcriptChunksToText, transcriptPreview } from "@/lib/transcript";
import { runMeaningfulMessage } from "@/lib/mm";

// Give Next.js more time; the full pipeline can take 60-120s.
export const maxDuration = 300;

const requestSchema = z.object({
  youtubeUrl: z.string().url(),
  targetMinutes: z.number().min(3).max(20).default(10),
  churchName: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = requestSchema.parse(body);

    const source = await getTranscriptFromYouTube(parsed.youtubeUrl);
    const rawTranscript = transcriptChunksToText(source.chunks);
    const cleaned = basicCleanTranscript(rawTranscript);

    if (cleaned.length < 500) {
      return NextResponse.json(
        { error: "Transcript is too short to be a sermon." },
        { status: 400 }
      );
    }

    const mm = await runMeaningfulMessage({
      transcript: cleaned,
      targetMinutes: parsed.targetMinutes,
      churchName: parsed.churchName
    });

    return NextResponse.json({
      videoId: source.videoId,
      title: source.title,
      transcriptTitle: source.transcriptTitle,
      analysis: mm.analysis,
      mmScript: mm.mmScript,
      publishKit: mm.publishKit,
      scenePlan: mm.scenePlan,
      fidelityReport: mm.fidelityReport,
      usage: mm.usage,
      rawTranscriptPreview: transcriptPreview(source.chunks, 2200),
      sermonOnlyPreview: mm.sermonOnlyText.slice(0, 2200)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/mm/from-youtube] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
