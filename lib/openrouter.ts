/**
 * OpenRouter client for The Meaningful Message.
 *
 * Uses the standard WinTech env vars: OPENROUTER_API_KEY and OPENROUTER_MODEL_ID.
 * All LLM calls in every Steve project go through this pattern.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterResult<T = string> = {
  content: T;
  tokensIn: number;
  tokensOut: number;
  model: string;
};

export async function callOpenRouter<T = string>(
  prompt: string,
  expectJson = false,
  systemOverride?: string
): Promise<OpenRouterResult<T>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL_ID || "openai/gpt-4.1-mini";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }

  const systemPrompt = systemOverride ?? `
You are a careful sermon analysis and transformation assistant for
"The Meaningful Message" — a service that extends Sunday sermons into
digital-native, YouTube-ready messages without altering theological meaning.

Rules you never break:
- Preserve the preacher's actual message and scripture references.
- Never fabricate scriptures, quotes, or doctrinal claims.
- When uncertain, flag it instead of guessing.
- Respect the pastor's voice and the church's denominational context.
`.trim();

  const body: Record<string, any> = {
    model: modelId,
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ]
  };

  if (expectJson) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL ?? "https://meaningfulmessage.app",
      "X-Title": "The Meaningful Message"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const tokensIn = data?.usage?.prompt_tokens ?? 0;
  const tokensOut = data?.usage?.completion_tokens ?? 0;

  if (!content) {
    throw new Error("OpenRouter returned no content.");
  }

  return {
    content: (expectJson ? JSON.parse(content) : content) as T,
    tokensIn,
    tokensOut,
    model: modelId
  };
}

/**
 * Rough cost estimate based on typical OpenRouter pricing.
 * Adjust the rates here for whichever model you end up running.
 */
export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  // Rates per 1M tokens, rough defaults
  const rates: Record<string, { in: number; out: number }> = {
    "openai/gpt-4.1-mini":    { in: 0.15,  out: 0.60  },
    "openai/gpt-4.1":         { in: 2.00,  out: 8.00  },
    "anthropic/claude-sonnet-4.5": { in: 3.00, out: 15.00 },
    "google/gemini-2.5-flash": { in: 0.075, out: 0.30 }
  };
  const rate = rates[model] ?? { in: 1.0, out: 4.0 };
  return (tokensIn * rate.in + tokensOut * rate.out) / 1_000_000;
}
