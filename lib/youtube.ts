import { TranscriptChunk } from "@/types/mm";

// ─── Video URL parsing ────────────────────────────────────────
export function extractVideoId(input: string): string {
    try {
          const url = new URL(input);
          if (url.hostname.includes("youtu.be")) {
                  const id = url.pathname.replace("/", "").trim();
                  if (id) return id;
          }
          const id = url.searchParams.get("v");
          if (id) return id;
          // Handle /embed/VIDEOID and /shorts/VIDEOID
      const pathParts = url.pathname.split("/").filter(Boolean);
          if (pathParts.length >= 2 && (pathParts[0] === "embed" || pathParts[0] === "shorts")) {
                  return pathParts[1];
          }
    } catch {
          // Fall through
    }
    // Maybe they just passed the bare ID
  if (/^[A-Za-z0-9_-]{11}$/.test(input.trim())) {
        return input.trim();
  }
    throw new Error(`Invalid YouTube URL or ID: ${input}`);
}

// ─── Watch page fetch ─────────────────────────────────────────
async function fetchWatchHtml(videoId: string): Promise<string> {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Accept-Language": "en-US,en;q=0.9"
          },
          cache: "no-store"
    });
    if (!res.ok) {
          throw new Error(`Failed to fetch YouTube watch page for ${videoId} (${res.status}).`);
    }
    return res.text();
}

function decodeHtmlEntities(text: string): string {
    return text
      .replace(/\\u0026/g, "&")
      .replace(/\\u003d/g, "=")
      .replace(/\\u002F/g, "/")
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\"/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
}

// ─── Duration extraction ──────────────────────────────────────
/**
 * Extract video duration in seconds from the watch page HTML.
 * YouTube embeds lengthSeconds in the ytInitialPlayerResponse JSON.
 * Returns null if it can't be found.
 */
function extractDurationSec(html: string): number | null {
    // Primary: ytInitialPlayerResponse.videoDetails.lengthSeconds
  const m1 = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
    if (m1) return parseInt(m1[1], 10);
    // Fallback: microformat.playerMicroformatRenderer.lengthSeconds
  const m2 = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
    if (m2) return Math.round(parseInt(m2[1], 10) / 1000);
    return null;
}

// ─── Live stream detection ────────────────────────────────────
/**
 * Returns true if the watch page indicates this is an active or past live stream.
 */
function extractIsLiveOrReplay(html: string): boolean {
    // isLive or isLiveContent flags in ytInitialPlayerResponse
  if (/"isLive"\s*:\s*true/.test(html)) return true;
    if (/"isLiveContent"\s*:\s*true/.test(html)) return true;
    return false;
}

type CaptionTrack = { baseUrl: string; languageCode?: string; name?: string };

function extractCaptionTracks(html: string): CaptionTrack[] {
    const marker = '"captionTracks":';
    const start = html.indexOf(marker);
    if (start === -1) {
          throw new Error("No caption tracks found on the YouTube page.");
    }
    const slice = html.slice(start + marker.length);
    // Find the end of the array
  let depth = 0;
    let end = -1;
    for (let i = 0; i < slice.length; i++) {
          const ch = slice[i];
          if (ch === "[") depth++;
          else if (ch === "]") {
                  depth--;
                  if (depth === 0) {
                            end = i;
                            break;
                  }
          }
    }
    if (end === -1) throw new Error("Could not parse caption tracks JSON.");
    const rawJson = slice.slice(0, end + 1);
    const parsed = JSON.parse(rawJson);
    return parsed.map((item: any) => ({
          baseUrl: decodeHtmlEntities(item.baseUrl),
          languageCode: item.languageCode,
          name: item.name?.simpleText ?? item.name?.runs?.[0]?.text
    }));
}

function pickEnglishTrack(tracks: CaptionTrack[]): CaptionTrack {
    return (
          tracks.find((t) => t.languageCode === "en") ??
          tracks.find((t) => t.languageCode?.startsWith("en")) ??
          tracks[0]
        );
}

// Parse timed-text XML (attribute order on <text> is not guaranteed)
async function fetchCaptionTrack(baseUrl: string): Promise<TranscriptChunk[]> {
  const res = await fetch(baseUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch caption track: ${res.status}`);
      const xml = await res.text();
        return parseCaptionXml(xml);
        }

        // Parse any YouTube timed-text XML document.
        // <text start="N" dur="N"> or <text dur="N" start="N"> both work.
        function parseCaptionXml(xml: string): TranscriptChunk[] {
          const chunks: TranscriptChunk[] = [];
            const elementRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
              let m: RegExpExecArray | null;
                while ((m = elementRe.exec(xml)) !== null) {
                    const attrs = m[1];
                        const rawText = m[2];
                            const startMatch = attrs.match(/\bstart="([\d.]+)"/);
                                const durMatch = attrs.match(/\bdur="([\d.]+)"/);
                                    if (!startMatch) continue;
                                        const text = decodeHtmlEntities(rawText)
                                              .replace(/<[^>]+>/g, "")
                                                    .replace(/\n/g, " ")
                                                          .trim();
                                                              if (!text) continue;
                                                                  chunks.push({
                                                                        start: parseFloat(startMatch[1]),
                                                                              dur: durMatch ? parseFloat(durMatch[1]) : 0,
                                                                                    text
                                                                                        });
                                                                                          }
                                                                                            return chunks;
                                                                                            }

                                                                                            // Direct timedtext API fallback — works from server IPs when the
                                                                                            // watch page approach is blocked by YouTube's bot-detection.
                                                                                            async function fetchTranscriptDirect(videoId: string): Promise<TranscriptChunk[]> {
                                                                                              // Try English first, then auto-generated English, then any language
                                                                                                const attempts = [
                                                                                                    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
                                                                                                        `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`,
                                                                                                            `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US`,
                                                                                                              ];
                                                                                                                for (const url of attempts) {
                                                                                                                    try {
                                                                                                                          const res = await fetch(url, {
                                                                                                                                  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                                                                                                                                          cache: "no-store"
                                                                                                                                                });
                                                                                                                                                      if (!res.ok) continue;
                                                                                                                                                            const xml = await res.text();
                                                                                                                                                                  if (!xml || xml.trim().length < 20) continue;
                                                                                                                                                                        const chunks = parseCaptionXml(xml);
                                                                                                                                                                              if (chunks.length > 0) return chunks;
                                                                                                                                                                                  } catch {
                                                                                                                                                                                        continue;
                                                                                                                                                                                            }
                                                                                                                                                                                              }
                                                                                                                                                                                                throw new Error("No usable captions found via direct timedtext API.");
                                                                                                                                                                                                }

export async function getTranscriptFromYouTube(input: string): Promise<{
  videoId: string;
    title: string;
      transcriptTitle?: string;
        durationSec: number | null;
          isLiveOrReplay: boolean;
            chunks: TranscriptChunk[];
            }> {
              const videoId = extractVideoId(input);

                // ── Primary approach: scrape the watch page for caption track URLs ──
                  // This gives us signed URLs that work reliably but only when YouTube
                    // doesn't serve a bot-detection page (which blocks cloud server IPs).
                      try {
                          const html = await fetchWatchHtml(videoId);

                              const titleMatch =
                                    html.match(/<meta\s+name="title"\s+content="([^"]+)"/) ??
                                          html.match(/<title>([^<]+)<\/title>/);
                                              const title = titleMatch
                                                    ? decodeHtmlEntities(titleMatch[1]).replace(/\s*-\s*YouTube\s*$/, "").trim()
                                                          : videoId;

                                                              const durationSec = extractDurationSec(html);
                                                                  const isLiveOrReplay = extractIsLiveOrReplay(html);

                                                                      const tracks = extractCaptionTracks(html);
                                                                          const track = pickEnglishTrack(tracks);
                                                                              const chunks = await fetchCaptionTrack(track.baseUrl);

                                                                                  if (chunks.length > 0) {
                                                                                        return { videoId, title, transcriptTitle: track.name, durationSec, isLiveOrReplay, chunks };
                                                                                            }
                                                                                                // Chunks is empty — fall through to direct API
                                                                                                    console.warn(`[youtube] watch-page caption track empty for ${videoId}, trying direct API...`);
                                                                                                      } catch (err) {
                                                                                                          const msg = err instanceof Error ? err.message : String(err);
                                                                                                              console.warn(`[youtube] watch-page approach failed for ${videoId}: ${msg}. Trying direct API...`);
                                                                                                                }

                                                                                                                  // ── Fallback: direct timedtext API ──
                                                                                                                    // Works when the watch page is blocked by YouTube bot-detection.
                                                                                                                      // Returns no title or duration (only what we can get without the watch page).
                                                                                                                        console.log(`[youtube] using direct timedtext API for ${videoId}`);
                                                                                                                          const chunks = await fetchTranscriptDirect(videoId);
                                                                                                                            return {
                                                                                                                                videoId,
                                                                                                                                    title: videoId, // no title without watch page
                                                                                                                                        transcriptTitle: "auto-generated",
                                                                                                                                            durationSec: null,
                                                                                                                                                isLiveOrReplay: false,
                                                                                                                                                    chunks
                                                                                                                                                      };
                                                                                                                                                      }
                                                                                                                                                      
// ─── Channel RSS feed (for the watcher) ──────────────────────
export type ChannelUpload = {
    videoId: string;
    title: string;
    publishedAt: string;
};

/**
 * Fetch the 15 most recent uploads for a channel.
 * Uses YouTube's public RSS feed — no API key, no quotas.
 */
export async function fetchChannelUploads(youtubeChannelId: string): Promise<ChannelUpload[]> {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`;
    const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          cache: "no-store"
    });
    if (!res.ok) {
          throw new Error(`Channel RSS fetch failed for ${youtubeChannelId}: ${res.status}`);
    }
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    return entries
      .map((entry) => {
              const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? "";
              const titleRaw = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
              const published = entry.match(/<published>(.*?)<\/published>/)?.[1] ?? "";
              return {
                        videoId,
                        title: decodeHtmlEntities(titleRaw).trim(),
                        publishedAt: published
              };
      })
      .filter((v) => v.videoId);
}
