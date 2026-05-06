/**
 * The Meaningful Message — Prompt Chain
 * ═══════════════════════════════════════════════════════════════
 * Five prompts in sequence:
 *   1. Sermon boundary detection (remove announcements, worship, etc.)
 *   2. Sermon analysis (extract theme, scripture, points, application)
 *   3. M&M script rewrite (10-minute YouTube-native version)
 *   4. Scene plan (visual guidance for headless video)
 *   5. Publish kit (titles, thumbnails, shorts, description)
 */

export function sermonBoundaryPrompt(transcript: string): string {
  return `
You are given a transcript from a full church service video.

Your job:
1. Identify the sermon-only portion.
2. Remove announcements, offering, worship lyrics, housekeeping, stage banter,
   and non-sermon transitions — unless they are essential to the preached message.
3. Preserve the actual sermon word-for-word as much as possible (this is the
   preacher's message; we are NOT rewriting it here).

Return valid JSON with exactly these keys:
{
  "sermonOnlyText": "",
  "sermonStartHint": "",
  "sermonEndHint": "",
  "reasoningSummary": ""
}

- "sermonOnlyText": the extracted sermon text, verbatim from the transcript.
- "sermonStartHint": a short phrase identifying where the sermon begins
   (e.g. "Pastor opens with 'Open your Bibles to Romans 8...'").
- "sermonEndHint": a short phrase identifying where the sermon ends
   (e.g. "Pastor closes with the prayer of invitation").
- "reasoningSummary": 1-2 sentences on how you decided the boundaries.

Transcript:
${transcript}
`.trim();
}

export function sermonAnalysisPrompt(sermonOnlyText: string): string {
  return `
Analyze this sermon text and return valid JSON with exactly these keys:

{
  "centralIdea": "",
  "primaryScriptures": [],
  "supportingPoints": [],
  "audienceProblem": "",
  "mainApplication": ""
}

Rules you must not break:
- Do NOT invent scripture references. Only list verses the preacher actually
  cited or read aloud.
- Do NOT add theology that is not in the sermon.
- Keep the language plain and useful.
- "centralIdea": one sentence, the main message the preacher was trying to convey.
- "primaryScriptures": list of book-chapter:verse references actually used.
- "supportingPoints": 2-5 bullet-sized points the preacher made.
- "audienceProblem": the human situation the sermon was addressing.
- "mainApplication": what the preacher asked listeners to DO or believe differently.

Sermon text:
${sermonOnlyText}
`.trim();
}

export function mmScriptPrompt(sermonOnlyText: string, targetMinutes: number): string {
  return `
Create a ${targetMinutes}-minute Meaningful Message (M&M) script from the sermon below.

Definition of the M&M:
- It is a headless, YouTube-native companion message.
- It keeps the sermon's actual meaning and scripture intact.
- It is tighter, clearer, and built for a digital audience.
- It should feel spiritually serious, emotionally clear, and highly listenable.
- It should NOT sound like clickbait.
- It should NOT sound like a lecture transcript.
- It should NOT invent new illustrations, stories, or theology.

Structure (use these as internal guides, not as labels in the output):
1. Hook (0-20 seconds) — lead with the human problem, not the scripture citation.
2. Human problem — why this message matters to a stranger watching.
3. Tension — what makes this hard or counterintuitive.
4. Biblical truth — the scripture and the preacher's main insight.
5. Key illustration or story — use ONLY what the preacher actually used.
6. Practical application — what the preacher asked us to do.
7. Closing reflection — a spiritually grounded close, not a sales pitch.

Tone:
- Conversational but reverent.
- Second person ("you") is fine sparingly.
- Short sentences. Digital pacing.

Output plain text only. Do not use markdown headers or labels.
Aim for roughly ${targetMinutes * 140} words (about ${targetMinutes} minutes of narration).

Sermon text:
${sermonOnlyText}
`.trim();
}

export function scenePlanPrompt(mmScript: string): string {
  return `
Create a scene plan for this M&M script, broken into ~25-second scenes.

Return valid JSON with this exact shape:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "startSec": 0,
      "endSec": 25,
      "narration": "",
      "visualConcept": "",
      "onScreenText": "",
      "scriptureReference": ""
    }
  ]
}

Rules:
- "narration": the actual words said in this scene (from the script, verbatim).
- "visualConcept": describe what a video editor or AI image model should generate.
  Keep it concrete: "close-up of hands folded in prayer on a wooden table."
- "onScreenText": a short phrase to display on screen during this scene (optional).
- "scriptureReference": include only if scripture is being referenced in this scene.

Keep scenes between 20-30 seconds. Don't invent content — base everything on the script.

Script:
${mmScript}
`.trim();
}

export function publishKitPrompt(mmScript: string, churchName: string): string {
  return `
Generate a publishing kit for this M&M video. Return valid JSON:

{
  "titles": [],
  "thumbnailTexts": [],
  "shortIdeas": [],
  "description": "",
  "pinnedComment": ""
}

Requirements:
- "titles": 10 YouTube title options. Human, curiosity-driven, NOT clickbait.
  Avoid "You Won't Believe" / "SHOCKING" / ALL CAPS. Avoid fake urgency.
- "thumbnailTexts": 5 short (2-5 word) thumbnail text options. Direct, emotional.
- "shortIdeas": 3-5 ideas for YouTube Shorts pulled from the script. Each idea
  should include a start timestamp (rough), the line to use, and why it works.
- "description": a 3-paragraph YouTube description. Include a 1-line hook,
  a summary of the message, and an invitation to ${churchName}.
- "pinnedComment": a thoughtful pinned comment inviting reflection.

Script:
${mmScript}
`.trim();
}

export function fidelityCheckPrompt(sermonOnlyText: string, mmScript: string): string {
  return `
You are a fidelity checker. Compare the rewritten M&M script against the
original sermon and flag anything that drifted.

Return valid JSON:
{
  "supportedPoints": [],
  "weaklySupported": [],
  "unsupportedClaims": [],
  "confidenceScore": 0
}

- "supportedPoints": claims in the M&M that are clearly in the sermon.
- "weaklySupported": claims that extrapolate beyond what the sermon actually said.
- "unsupportedClaims": claims that appear nowhere in the sermon (these are RED FLAGS).
- "confidenceScore": 0-100, how faithfully the M&M represents the sermon.

Original sermon:
${sermonOnlyText}

M&M script:
${mmScript}
`.trim();
}
