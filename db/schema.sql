-- ============================================================
-- The Meaningful Message — Postgres Schema
-- ============================================================
-- Run on Railway Postgres. Safe to re-run (idempotent).

-- Churches subscribe once, forever.
CREATE TABLE IF NOT EXISTS churches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT UNIQUE NOT NULL,
  denomination   TEXT,
  tone_profile   JSONB DEFAULT '{}'::jsonb,
  reviewer_email TEXT NOT NULL,
  auto_approve_after_days INTEGER DEFAULT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  active         BOOLEAN DEFAULT TRUE
);

-- YouTube channels attached to a church (a church can have multiple campuses).
CREATE TABLE IF NOT EXISTS channels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  youtube_channel_id  TEXT NOT NULL,
  youtube_handle      TEXT,
  last_checked_at     TIMESTAMPTZ,
  last_video_id_seen  TEXT,
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(church_id, youtube_channel_id)
);

-- Each discovered sermon becomes a job.
CREATE TABLE IF NOT EXISTS sermon_jobs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id            UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  channel_id           UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  video_id             TEXT NOT NULL,
  video_title          TEXT,
  video_published_at   TIMESTAMPTZ,
  video_duration_sec   INTEGER,
  status               TEXT NOT NULL DEFAULT 'discovered',
    -- discovered → transcribing → analyzing → generating → pending_review
    -- → approved → published → rejected → error
  error_message        TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, video_id)
);

-- The actual M&M artifact produced for each job.
CREATE TABLE IF NOT EXISTS mm_outputs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sermon_job_id     UUID NOT NULL REFERENCES sermon_jobs(id) ON DELETE CASCADE,
  raw_transcript    TEXT,
  sermon_only_text  TEXT,
  analysis          JSONB,
  mm_script         TEXT,
  scene_plan        JSONB,
  publish_kit       JSONB,
  fidelity_report   JSONB,
  model_used        TEXT,
  tokens_in         INTEGER,
  tokens_out        INTEGER,
  cost_usd          NUMERIC(10,4),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Reviewer actions (audit log).
CREATE TABLE IF NOT EXISTS reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sermon_job_id  UUID NOT NULL REFERENCES sermon_jobs(id) ON DELETE CASCADE,
  reviewer_email TEXT,
  action         TEXT NOT NULL, -- approved | rejected | edited
  notes          TEXT,
  edited_script  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Transcripts pushed in by TDE (or any other ingestor). Keyed by YouTube
-- video ID so re-pushing the same video upserts. M&M never fetches from
-- YouTube directly anymore — the watcher just creates discovered jobs and
-- the generator waits for a row here before processing.
CREATE TABLE IF NOT EXISTS transcripts_cache (
  youtube_video_id TEXT PRIMARY KEY,
  video_title      TEXT,
  chunks           JSONB NOT NULL,
  source           TEXT,    -- e.g. 'yt-dlp-subs' | 'watch-page' | 'groq-whisper'
  fetched_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Video render attempts. One M&M output can be re-rendered with different
-- themes/voices, so this is one-to-many with mm_outputs.
CREATE TABLE IF NOT EXISTS video_renders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mm_output_id    UUID NOT NULL REFERENCES mm_outputs(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending',
    -- pending → rendering → done → failed
  progress_pct    INTEGER NOT NULL DEFAULT 0,
  current_step    TEXT,
  theme           TEXT NOT NULL DEFAULT 'bold-dark',
  voice_id        TEXT NOT NULL,
  voice_label     TEXT,
  output_path     TEXT,
  duration_sec    INTEGER,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_jobs_status     ON sermon_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_church     ON sermon_jobs(church_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created    ON sermon_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(active, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_reviews_job     ON reviews(sermon_job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_renders_status  ON video_renders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_renders_mm      ON video_renders(mm_output_id, created_at DESC);
