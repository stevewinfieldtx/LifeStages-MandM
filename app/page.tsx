"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  video_id: string;
  video_title: string | null;
  status: string;
  created_at: string;
  church_name: string;
};

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // One-off test form
  const [testUrl, setTestUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  async function loadJobs() {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load jobs");
      setJobs(data.jobs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 10_000);
    return () => clearInterval(interval);
  }, []);

  async function runTest() {
    if (!testUrl) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/mm/from-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: testUrl, targetMinutes: 10 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setTestResult(data);
    } catch (err) {
      setTestResult({ error: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="container">
      <div className="header">
        <h1>The Meaningful Message</h1>
        <div className="subtitle">
          Automated Sunday-sermon-to-digital-message pipeline. Churches do nothing.
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* ─── Job Queue ─── */}
      <section style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Job Queue</h2>
          <button className="btn btn-secondary" onClick={loadJobs}>Refresh</button>
        </div>

        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">
            No jobs yet. Seed a church and run the watcher:
            <pre style={{ textAlign: "left", marginTop: 16, display: "inline-block" }}>
{`SEED_YT_CHANNEL_ID=UCxxxxx npx tsx scripts/seed-fielder.ts
npx tsx workers/watcher/index.ts`}
            </pre>
          </div>
        ) : (
          <div className="job-list">
            {jobs.map((job) => (
              <a key={job.id} href={`/review/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="job-row">
                  <div>
                    <div className="title">{job.video_title ?? job.video_id}</div>
                    <div className="meta">
                      {job.church_name} · {new Date(job.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span className={`badge badge-${job.status.replace("_", "")}`}>
                    {job.status.replace("_", " ")}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* ─── One-off Test ─── */}
      <section className="card">
        <h3>One-off Test (no channel subscription needed)</h3>
        <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 0 }}>
          Paste a YouTube sermon URL to validate the pipeline without wiring up the watcher.
          Useful for testing prompts or spot-checking a church before onboarding them.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <input
            className="input"
            placeholder="https://www.youtube.com/watch?v=..."
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
          />
          <button className="btn btn-primary" disabled={testing || !testUrl} onClick={runTest}>
            {testing ? "Running..." : "Run M&M"}
          </button>
        </div>

        {testResult && (
          <div style={{ marginTop: 24 }}>
            {testResult.error ? (
              <div className="error">{testResult.error}</div>
            ) : (
              <>
                <h3 style={{ marginBottom: 8 }}>{testResult.title}</h3>
                <div className="grid grid-2">
                  <div className="card">
                    <h3>Analysis</h3>
                    <pre>{JSON.stringify(testResult.analysis, null, 2)}</pre>
                  </div>
                  <div className="card">
                    <h3>M&M Script</h3>
                    <pre>{testResult.mmScript}</pre>
                  </div>
                </div>
                <div className="card" style={{ marginTop: 16 }}>
                  <h3>Publish Kit</h3>
                  <pre>{JSON.stringify(testResult.publishKit, null, 2)}</pre>
                </div>
                {testResult.fidelityReport && (
                  <div className="card" style={{ marginTop: 16 }}>
                    <h3>Fidelity Report</h3>
                    <div className="fidelity-score">
                      <span>Confidence:</span>
                      <span className={
                        testResult.fidelityReport.confidenceScore >= 80 ? "score fidelity-high" :
                        testResult.fidelityReport.confidenceScore >= 60 ? "score fidelity-medium" :
                        "score fidelity-low"
                      }>
                        {testResult.fidelityReport.confidenceScore}/100
                      </span>
                    </div>
                    <pre style={{ marginTop: 12 }}>{JSON.stringify(testResult.fidelityReport, null, 2)}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
