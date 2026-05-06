/**
 * Streams the rendered MP4 from disk with HTTP Range support so
 * browser <video> players can seek. 404 if the render isn't done.
 */

import { queryOne } from "@/lib/db";
import { finalMp4Path } from "@/lib/render/storage";
import { createReadStream, statSync } from "node:fs";
import type { ReadStream } from "node:fs";
import { Readable } from "node:stream";

export const runtime = "nodejs";

type RenderRow = {
  status: string;
  output_path: string | null;
};

function nodeStreamToWeb(stream: ReadStream): ReadableStream<Uint8Array> {
  // Node 18+/Next 15 supports Readable.toWeb
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await queryOne<RenderRow>(
      `SELECT status, output_path FROM video_renders WHERE id = $1`,
      [id]
    );

    if (!row) {
      return new Response("Not found", { status: 404 });
    }
    if (row.status !== "done") {
      return new Response(`Render not ready (status: ${row.status})`, {
        status: 409
      });
    }

    // Trust output_path from DB if present, otherwise reconstruct.
    const filePath = row.output_path || finalMp4Path(id);
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      return new Response("Render file missing on disk", { status: 410 });
    }

    const fileSize = stat.size;
    const range = req.headers.get("range");

    // Whole-file response (no Range header)
    if (!range) {
      const stream = createReadStream(filePath);
      return new Response(nodeStreamToWeb(stream), {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=300"
        }
      });
    }

    // Parse "bytes=START-END" (END optional)
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      return new Response("Malformed Range header", { status: 416 });
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (
      isNaN(start) || isNaN(end) ||
      start < 0 || end >= fileSize || start > end
    ) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`
        }
      });
    }

    const chunkSize = end - start + 1;
    const stream = createReadStream(filePath, { start, end });

    return new Response(nodeStreamToWeb(stream), {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 500 });
  }
}
