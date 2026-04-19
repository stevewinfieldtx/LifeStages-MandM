"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type JobDetail = {
  id: string;
  video_id: string;
  video_title: string | null;
  status: string;
  church_name: string;
  analysis: any;
  mm_script: string;
  scene_plan: any;
  publish_kit: any;
  fidelity_report: any;
  sermon_only_text: string;
  created_at: string;
};

type Tab = "script" | "sermon" | "analysis" | "scenes" | "publish" | "fidelity";

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<Tab>("script");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/jobs/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) {
          setError(j.error);
        } else {
          setJob(j);
          setEditedScript(j.mm_script ?? "");
        }
      });
  }, [id]);

  async function decide(action: "approved" | "rejected" | "edited") {
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch(`/api/jobs/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: notes || undefined,
          editedScript: action === "edited" ? editedScript : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Marked as ${action}. Redirecting...`);
      setTimeout(() => router.push("/"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <main className="container"><div className="error">{error}</div></main>;
  if (!job) return <main className="container">Loading...</main>;

  const fidelity = job.fidelity_report;
  const fidelityClass = !fidelity ? "" :
    fidelity.confidenceScore >= 80 ? "fidelity-high" :
    fidelity.confidenceScore >= 60 ? "fidelity-medium" :
    "fidelity-low";

  return (
    <main className="container">
      <div className="header">
        <a href="/" style={{ fontSize: 14 }}>← Back to queue</a>
        <h1 style={{ marginTop: 12 }}>{job.video_title ?? job.video_id}</h1>
        <div className="subtitle">
          {job.church_name} ·{" "}
          <a href={`https://www.youtube.com/watch?v=${job.video_id}`} target="_blank" rel="noreferrer">
            Watch original →
          </a>{" "}
          · <span className={`badge badge-${job.status.replace("_", "")}`}>{job.status.replace("_", " ")}</span>
          {fidelity && (
            <span style={{ marginLeft: 16 }}>
              Fidelity: <span className={fidelityClass} style={{ fontWeight: 700 }}>
                {fidelity.confidenceScore}/100
              </span>
            </span>
          )}
        </div>
      </div>

      {message && <div className="success">{message}</div>}

      <div className="tab-nav">
        <button className={tab === "script" ? "active" : ""} onClick={() => setTab("script")}>M&M Script</button>
        <button className={tab === "sermon" ? "active" : ""} onClick={() => setTab("sermon")}>Original Sermon</button>
        <button className={tab === "analysis" ? "active" : ""} onClick={() => setTab("analysis")}>Analysis</button>
        <button className={tab === "scenes" ? "active" : ""} onClick={() => setTab("scenes")}>Scene Plan</button>
        <button className={tab === "publish" ? "active" : ""} onClick={() => setTab("publish")}>Publish Kit</button>
        <button className={tab === "fidelity" ? "active" : ""} onClick={() => setTab("fidelity")}>Fidelity</button>
      </div>

      {tab === "script" && (
        <div className="card">
          <h3>M&M Script (edit inline if needed)</h3>
          <textarea
            className="textarea"
            style={{ minHeight: 500 }}
            value={editedScript}
            onChange={(e) => setEditedScript(e.target.value)}
          />
          <div style={{ marginTop: 8, fontSize: 13, color: "#94a3b8" }}>
            Words: {editedScript.split(/\s+/).filter(Boolean).length} · Approx minutes:{" "}
            {(editedScript.split(/\s+/).filter(Boolean).length / 140).toFixed(1)}
          </div>
        </div>
      )}

      {tab === "sermon" && (
        <div className="card">
          <h3>Sermon-Only Excerpt (after boundary detection)</h3>
          <pre style={{ maxHeight: 600, overflowY: "auto" }}>{job.sermon_only_text}</pre>
        </div>
      )}

      {tab === "analysis" && (
        <div className="card">
          <h3>Sermon Analysis</h3>
          <pre>{JSON.stringify(job.analysis, null, 2)}</pre>
        </div>
      )}

      {tab === "scenes" && (
        <div className="card">
          <h3>Scene Plan</h3>
          <pre>{JSON.stringify(job.scene_plan, null, 2)}</pre>
        </div>
      )}

      {tab === "publish" && (
        <div className="card">
          <h3>Publish Kit</h3>
          <pre>{JSON.stringify(job.publish_kit, null, 2)}</pre>
        </div>
      )}

      {tab === "fidelity" && (
        <div className="card">
          <h3>Fidelity Report</h3>
          <pre>{JSON.stringify(job.fidelity_report, null, 2)}</pre>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <h3>Review Notes (optional)</h3>
        <textarea
          className="textarea"
          placeholder="Any feedback for the engine or reviewer record..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={submitting} onClick={() => decide("approved")}>
          ✓ Approve
        </button>
        <button className="btn btn-secondary" disabled={submitting} onClick={() => decide("edited")}>
          ✎ Save Edits & Re-Review
        </button>
        <button className="btn btn-danger" disabled={submitting} onClick={() => decide("rejected")}>
          ✕ Reject
        </button>
      </div>
    </main>
  );
}
