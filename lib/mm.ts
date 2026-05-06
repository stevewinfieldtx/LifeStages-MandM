import { callOpenRouter, estimateCost } from "@/lib/openrouter";
import {
  fidelityCheckPrompt,
  mmScriptPrompt,
  publishKitPrompt,
  scenePlanPrompt,
  sermonAnalysisPrompt,
  sermonBoundaryPrompt
} from "@/lib/prompts";
import {
  FidelityReport,
  MMResult,
  PublishKit,
  ScenePlan,
  SermonAnalysis
} from "@/types/mm";

export type MMRunOutput = MMResult & {
  sermonOnlyText: string;
  fidelityReport: FidelityReport;
  usage: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    model: string;
  };
};

export async function runMeaningfulMessage(input: {
  transcript: string;
  targetMinutes: number;
  churchName?: string;
}): Promise<MMRunOutput> {
  const churchName = input.churchName ?? "your church";
  let tokensIn = 0;
  let tokensOut = 0;
  let modelUsed = "";

  // ─── Step 1: Sermon boundary detection ─────────────────
  const boundary = await callOpenRouter<{
    sermonOnlyText: string;
    sermonStartHint?: string;
    sermonEndHint?: string;
    reasoningSummary?: string;
  }>(sermonBoundaryPrompt(input.transcript), true);
  tokensIn += boundary.tokensIn;
  tokensOut += boundary.tokensOut;
  modelUsed = boundary.model;

  // ─── Step 2: Sermon analysis ───────────────────────────
  const analysisRes = await callOpenRouter<SermonAnalysis>(
    sermonAnalysisPrompt(boundary.content.sermonOnlyText),
    true
  );
  tokensIn += analysisRes.tokensIn;
  tokensOut += analysisRes.tokensOut;

  const analysis: SermonAnalysis = {
    ...analysisRes.content,
    sermonStartHint: boundary.content.sermonStartHint,
    sermonEndHint: boundary.content.sermonEndHint
  };

  // ─── Step 3: M&M script rewrite ────────────────────────
  const scriptRes = await callOpenRouter<string>(
    mmScriptPrompt(boundary.content.sermonOnlyText, input.targetMinutes),
    false
  );
  tokensIn += scriptRes.tokensIn;
  tokensOut += scriptRes.tokensOut;
  const mmScript = scriptRes.content;

  // ─── Step 4: Scene plan ────────────────────────────────
  const sceneRes = await callOpenRouter<ScenePlan>(scenePlanPrompt(mmScript), true);
  tokensIn += sceneRes.tokensIn;
  tokensOut += sceneRes.tokensOut;

  // ─── Step 5: Publish kit ───────────────────────────────
  const publishRes = await callOpenRouter<PublishKit>(
    publishKitPrompt(mmScript, churchName),
    true
  );
  tokensIn += publishRes.tokensIn;
  tokensOut += publishRes.tokensOut;

  // ─── Step 6: Fidelity check ────────────────────────────
  const fidelityRes = await callOpenRouter<FidelityReport>(
    fidelityCheckPrompt(boundary.content.sermonOnlyText, mmScript),
    true
  );
  tokensIn += fidelityRes.tokensIn;
  tokensOut += fidelityRes.tokensOut;

  const costUsd = estimateCost(modelUsed, tokensIn, tokensOut);

  return {
    analysis,
    mmScript,
    scenePlan: sceneRes.content,
    publishKit: publishRes.content,
    sermonOnlyText: boundary.content.sermonOnlyText,
    fidelityReport: fidelityRes.content,
    usage: {
      tokensIn,
      tokensOut,
      costUsd,
      model: modelUsed
    }
  };
}
