"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { THEMES, DEFAULT_THEME, ThemeId } from "@/lib/render/themes";
import { VOICE_PRESETS } from "@/lib/render/voices";

type MmOutput = {
  mm_output_id: string;
  generated_at: string;
  sermon_job_id: string;
  video_id: string;
  video_title: string | null;
  job_status: string;
  church_name: string;
  scene_count: number;
  fidelity_score: number | null;
};

type RenderRow = {
  id: string;
  mm_output_id: string;
  status: string;
  progress_pct: number;
  current_step: string | null;
  theme: string;
  voice_label: string | null;
  duration_sec: number | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
  video_title: string | null;
  church_name: string;
};

export default function RenderPickerPage() {
  const router = useRouter();
  const [outputs, setOutputs] = useState<MmOutput[]>([]);
  const [renders, setRenders] = useState<RenderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickedId, setPickedId] = useState<string>("");
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [voiceId, setVoiceId] = useState<string>(VOICE_PRESETS[0].id);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const [oRes, rRes] = await Promise.all([
        fetch("/api/mm-outputs"),
        fetch("/api/renders")
      ]);
      const oData = await oRes.json();
      const rData = await rRes.json();
      if (!oRes.ok) throw new Error(oData.error || "Failed to load M&Ms");
      if (!rRes.ok) throw new Error(rData.error || "Failed to load renders");
      setOutputs(oData.outputs || []);
      setRenders(rData.renders || []);
      if (!pickedId && oData.outputs?.[0]?.mm_output_id) {
        setPickedId(oData.outputs[0].mm_output_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picked = useMemo(
    () => outputs.find((o) => o.mm_output_id === pickedId),
    [outputs, pickedId]
  );

  async function startRender() {
    if (!pickedId) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mm_output_id: pickedId, theme, voice_id: voiceId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create render");
      router.push(`/render/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSubmitting(false);
    }
  }

  return (
    <main className="container">
      <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1>Render Video</h1>
          <div className="subtitle">
            Turn a generated M&M into a 6–9 minute square video with slides + ElevenLabs narration.
          </div>
        </div>
        <a href="/" className="btn btn-secondary" style={{ textDecoration: "none" }}>
          ← Dashboard
        </a>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        {/* ─── Picker Form ─── */}
        <section className="card">
          <h3>1. Pick a sermon</h3>
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : outputs.length === 0 ? (
            <div className="empty-state">
              No generated M&Ms yet. Run the generator first.
            </div>
          ) : (
            <select
              className="select"
              value={pickedId}
              onChange={(e) => setPickedId(e.target.value)}
            >
              {outputs.map((o) => (
                <option key={o.mm_output_id} value={o.mm_output_id}>
                  {(o.video_title || o.video_id) +
                    `  ·  ${o.church_name}` +
                    `  ·  ${o.scene_count} scenes` +
                    (o.fidelity_score != null ? `  ·  fidelity ${o.fidelity_score}/100` : "")}
                </option>
              ))}
            </select>
          )}

          {picked && (
            <div className="meta" style={{ marginTop: 8, color: "#94a3b8", fontSize: 13 }}>
              Generated {new Date(picked.generated_at).toLocaleString()} ·
              <a
                href={`https://www.youtube.com/watch?v=${picked.video_id}`}
                target="_blank"
                rel="noreferrer"
                style={{ marginLeft: 6 }}
              >
                source video ↗
              </a>
            </div>
          )}

          <h3 style={{ marginTop: 24 }}>2. Choose a theme</h3>
          <div className="grid" style={{ gap: 8 }}>
            {Object.values(THEMES).map((t) => (
              <label
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 12,
                  border: `1px solid ${theme === t.id ? "#fbbf24" : "#334155"}`,
                  borderRadius: 12,
                  cursor: "pointer",
                  background: theme === t.id ? "#1f2937" : "transparent"
                }}
              >
                <input
                  type="radio"
                  name="theme"
                  value={t.id}
                  checked={theme === t.id}
                  onChange={() => setTheme(t.id)}
                  style={{ marginTop: 4 }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>{t.description}</div>
                  <div
                    style={{
                      marginTop: 8,
                      height: 28,
                      borderRadius: 6,
                      background: `linear-gradient(135deg, ${t.bgTop}, ${t.bgBottom})`,
                      border: "1px solid #1e293b",
                      position: "relative"
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        right: 8,
                        top: 5,
                        fontSize: 11,
                        color: t.accentColor,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase"
                      }}
                    >
                      Aa · {t.accentColor}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <h3 style={{ marginTop: 24 }}>3. Choose a voice</h3>
          <select
            className="select"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
          >
            {VOICE_PRESETS.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 13, color: "#94a3b8" }}>
            {VOICE_PRESETS.find((v) => v.id === voiceId)?.description}
          </div>

          <button
            className="btn btn-primary"
            style={{ marginTop: 24, width: "100%" }}
            disabled={!pickedId || submitting}
            onClick={startRender}
          >
            {submitting ? "Queueing…" : "Render Video"}
          </button>
        </section>

        {/* ─── Recent Renders ─── */}
        <section className="card">
          <h3>Recent renders</h3>
          {renders.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              No renders yet.
            </div>
          ) : (
            <div className="job-list">
              {renders.map((r) => (
                <a
                  key={r.id}
                  href={`/render/${r.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="job-row">
                    <div>
                      <div className="title">
                        {r.video_title || "(untitled)"}
                      </div>
                      <div className="meta">
                        {r.church_name} · {r.theme} · {r.voice_label || "voice"}
                        {r.duration_sec ? ` · ${Math.round(r.duration_sec)}s` : ""}
                      </div>
                      {r.status === "rendering" && (
                        <div className="meta" style={{ marginTop: 4 }}>
                          {r.progress_pct}% · {r.current_step}
                        </div>
                      )}
                    </div>
                    <span className={`badge badge-${r.status === "done" ? "approved" : r.status === "failed" ? "error" : r.status === "rendering" ? "generating" : "pending"}`}>
                      {r.status}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
