"use client";

import { use, useEffect, useState } from "react";

type RenderDetail = {
  id: string;
  mm_output_id: string;
  status: string;
  progress_pct: number;
  current_step: string | null;
  theme: string;
  voice_id: string;
  voice_label: string | null;
  duration_sec: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  video_title: string | null;
  youtube_video_id: string | null;
  church_name: string;
};

export default function RenderStatusPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [render, setRender] = useState<RenderDetail | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch(`/api/renders/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRender(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => {
      // Stop polling once terminal
      if (render?.status === "done" || render?.status === "failed") return;
      load();
    }, 3_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render?.status]);

  if (error) {
    return (
      <main className="container">
        <div className="header">
          <h1>Render not found</h1>
        </div>
        <div className="error">{error}</div>
        <a href="/render" className="btn btn-secondary" style={{ textDecoration: "none" }}>
          ← Back to picker
        </a>
      </main>
    );
  }

  if (!render) {
    return (
      <main className="container">
        <div className="header">
          <h1>Loading…</h1>
        </div>
      </main>
    );
  }

  const isDone = render.status === "done";
  const isFailed = render.status === "failed";
  const isRunning = render.status === "rendering" || render.status === "pending";

  return (
    <main className="container">
      <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{render.video_title || "(untitled sermon)"}</h1>
          <div className="subtitle">
            {render.church_name} · theme: <code>{render.theme}</code> · voice: {render.voice_label || render.voice_id}
          </div>
        </div>
        <a href="/render" className="btn btn-secondary" style={{ textDecoration: "none" }}>
          ← Picker
        </a>
      </div>

      {isRunning && (
        <section className="card" style={{ marginBottom: 24 }}>
          <h3>Rendering</h3>
          <div style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            height: 18,
            overflow: "hidden",
            marginBottom: 10
          }}>
            <div
              style={{
                width: `${render.progress_pct}%`,
                height: "100%",
                background: "#fbbf24",
                transition: "width 400ms ease"
              }}
            />
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8" }}>
            {render.progress_pct}% · {render.current_step || render.status}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
            Started {render.started_at ? new Date(render.started_at).toLocaleTimeString() : "—"}.
            Auto-refreshing every 3 seconds.
          </div>
        </section>
      )}

      {isFailed && (
        <section className="card" style={{ marginBottom: 24 }}>
          <h3>Render failed</h3>
          <div className="error" style={{ marginBottom: 0 }}>
            {render.error_message || "Unknown error"}
          </div>
        </section>
      )}

      {isDone && (
        <section className="card" style={{ marginBottom: 24 }}>
          <h3>Final video</h3>
          <video
            controls
            preload="metadata"
            src={`/api/renders/${render.id}/video`}
            style={{
              width: "100%",
              maxWidth: 720,
              borderRadius: 12,
              background: "#000",
              display: "block",
              margin: "0 auto 16px"
            }}
          />
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <a
              href={`/api/renders/${render.id}/video`}
              download={`${(render.video_title || "meaningful-message").replace(/[^a-z0-9]+/gi, "-")}.mp4`}
              className="btn btn-primary"
              style={{ textDecoration: "none" }}
            >
              Download MP4
            </a>
            {render.youtube_video_id && (
              <a
                href={`https://www.youtube.com/watch?v=${render.youtube_video_id}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ textDecoration: "none" }}
              >
                Source sermon ↗
              </a>
            )}
          </div>
          <div style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: "#94a3b8" }}>
            Duration: {render.duration_sec ? `${Math.floor(render.duration_sec / 60)}m ${render.duration_sec % 60}s` : "—"}
          </div>
        </section>
      )}
    </main>
  );
}
