# The Meaningful Message (M&M)

**Turn a church's Sunday sermon into a 10-minute YouTube-native digital discipleship message. Fully automated.**

Part of the LifeStages AI platform. Churches do nothing. The system watches their YouTube channel, detects new sermons, pulls the transcript, isolates the sermon-only portion, rewrites it as a digital-native message, and hands back a review-ready package.

---

## The bet

Churches already preach every Sunday. They already upload to YouTube. Most of those videos get almost no views because sermons are written for the pews, not the algorithm. We don't ask pastors to change what they do. We translate the echo.

**Input:** a church's YouTube channel
**Output:** a 10-minute headless companion video package (script + scene plan + titles + thumbnails + shorts)

---

## Architecture

One repo, four Railway services, one Postgres, one Volume:

```
┌──────────────────────────────────────────────────────┐
│  Railway Project: lifestages-mandm                   │
│                                                       │
│   Service 1: web         (Next.js dashboard + API)   │
│   Service 2: watcher     (cron: hourly channel poll) │
│   Service 3: generator   (always-on job worker)      │
│   Service 4: renderer    (always-on; ffmpeg + TTS)   │
│                                                       │
│   Postgres               (shared)                    │
│   Volume "renders"       (mounted at /data on web    │
│                           and renderer)              │
└──────────────────────────────────────────────────────┘
```

All services share `DATABASE_URL`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL_ID`.
The `web` and `renderer` services additionally need `ELEVENLABS_API_KEY` and
`RENDER_DATA_DIR=/data` (path of the mounted Volume).

---

## Quickstart (local dev)

```bash
# 1. Install dependencies
npm install

# 2. Set up your env
cp .env.example .env.local
# Edit .env.local with your OPENROUTER_API_KEY and DATABASE_URL

# 3. Initialize the database
npm run db:init

# 4. Seed Fielder Church (or any church) to test
# First, find their YouTube channel ID:
#   View source at https://www.youtube.com/@FielderChurch
#   Search for "channelId":"UC..."
SEED_YT_CHANNEL_ID=UCxxxxxxxxxxxxx npm run seed:fielder

# 5. Run the watcher once to pick up recent uploads
npm run dev:watcher

# 6. Run the generator worker in one terminal
npm run dev:generator

# 7. Run the Next.js dashboard in another terminal
npm run dev

# 8. (optional) Run the renderer worker if you want to make videos
#    Requires ELEVENLABS_API_KEY in .env.local
npm run dev:renderer

# 9. Open http://localhost:3000
#    Click "🎬 Render Video →" to pick an M&M, theme, and voice.
```

---

## Railway deployment

### Step 1: Create the Postgres

In the Railway dashboard:
1. New Project → Add PostgreSQL
2. Copy the `DATABASE_URL` (or reference it below)

### Step 2: Deploy the repo three times

Railway reads `railway.toml` and creates three services. For each one, add these env vars:

| Variable | Value |
|----------|-------|
| `OPENROUTER_API_KEY` | your OpenRouter key |
| `OPENROUTER_MODEL_ID` | `openai/gpt-4.1-mini` (or whichever) |
| `DATABASE_URL` | reference `${{ Postgres.DATABASE_URL }}` |
| `APP_URL` | the public URL of your `web` service |
| `RESEND_API_KEY` | (optional) for reviewer email notifications |
| `REVIEW_FROM_EMAIL` | (optional) e.g. `mm@yourdomain.com` |

### Step 3: Initialize the schema

Shell into the `web` service once:
```bash
npm run db:init
```

### Step 4: Seed your first church

```bash
SEED_YT_CHANNEL_ID=UCxxxxx SEED_REVIEWER_EMAIL=you@example.com npm run seed:fielder
```

### Step 5: Let the watcher run

Railway's cron schedule in `railway.toml` runs the watcher every hour. You should see jobs show up within ~30 minutes of a new sermon being published to YouTube.

---

## The pipeline

When a new sermon is discovered:

1. **Transcript fetch** — pulls captions directly from YouTube (no API key, no quotas)
2. **Boundary detection** — LLM strips announcements, worship, housekeeping; keeps only the sermon
3. **Analysis** — extracts central idea, scriptures cited, supporting points, application
4. **Rewrite** — converts to a 10-minute YouTube-native script (preserves meaning, changes delivery)
5. **Scene plan** — maps the script to ~25-second scenes with visual concepts
6. **Publish kit** — generates 10 titles, 5 thumbnail phrases, 3-5 shorts, description, pinned comment
7. **Fidelity check** — final pass comparing the rewrite back to the sermon; flags drift; scores 0-100

Total time: ~60-120 seconds per sermon depending on model and transcript length.

---

## Review flow

The church reviewer gets an email when a new M&M is ready. One click opens the review screen at `/review/[id]` where they can:

- **Approve** — marks the job as `approved`, ready for publishing
- **Edit & Re-review** — inline edit the script, keep in pending
- **Reject** — discard this one

Nothing publishes to YouTube automatically (yet). The approve step is the moment of trust.

---

## Non-negotiable guardrails

- **Never invent scriptures.** Only use what the preacher actually cited.
- **Never add doctrine not present in the sermon.**
- **Fidelity check must run** on every generated M&M. A score below 60 flags for mandatory review.
- **The pastor's review right is the product.** Auto-publish is earned over time per church, not default.

---

## File structure

```
lifestages-mandm/
├── app/                          Next.js 15 app router
│   ├── api/
│   │   ├── jobs/                 List + fetch + decide endpoints
│   │   └── mm/from-youtube/      One-off test endpoint
│   ├── review/[id]/              Review screen
│   ├── layout.tsx
│   ├── page.tsx                  Dashboard
│   └── globals.css
├── db/
│   └── schema.sql                Full Postgres schema
├── lib/                          Shared by app + workers
│   ├── db.ts                     pg Pool helper
│   ├── openrouter.ts             LLM client (OPENROUTER_MODEL_ID)
│   ├── youtube.ts                Transcript + channel RSS
│   ├── transcript.ts             Cleanup + chunking
│   ├── prompts.ts                All 6 LLM prompts
│   ├── mm.ts                     Pipeline orchestrator
│   └── email.ts                  Resend notifications
├── workers/
│   ├── watcher/index.ts          Cron: poll channels for new uploads
│   └── generator/index.ts        Always-on: process pending jobs
├── scripts/
│   ├── init-db.ts                Run schema.sql
│   └── seed-fielder.ts           Seed Fielder Church for testing
├── types/mm.ts                   Shared TypeScript types
├── railway.toml                  Three-service Railway config
├── package.json
├── tsconfig.json                 Next.js
├── tsconfig.workers.json         Workers (compile to dist/)
├── .env.example
└── README.md
```

---

## Before pushing to Railway

```powershell
# Steve's standard check
node --check next.config.js

# Or a full build
npm run build
npm run build:workers
```

---

## Rendering (v0.3, shipped)

Manual-trigger renderer that turns any generated `mm_outputs` row into a
1080×1080 square MP4 with slides + ElevenLabs narration.

- Open `/render` to pick a sermon, theme, and voice.
- The render worker polls `video_renders` and runs the pipeline:
  ElevenLabs TTS per scene → typographic slide PNG (`@napi-rs/canvas`) →
  per-scene MP4 (`ffmpeg-static`) → final concat to `final.mp4`.
- The web service streams the MP4 with HTTP Range support
  via `/api/renders/[id]/video`.
- On Railway, mount a Volume named `renders` at `/data` on both the `web`
  and `renderer` services (already declared in `railway.toml`). Locally,
  files land in `./data/renders/{id}/`.

To drop in nicer fonts, copy Inter and Playfair Display TTF files into
`./public/fonts/`. The slide renderer auto-registers everything in that
directory by filename.

## What's next

- **Auto-post to YouTube** — once a church has run clean for 4+ weeks, let them opt into auto-publish
- **Multi-campus support** — one church, multiple YouTube channels (already supported in schema)
- **Fidelity-gated publishing** — scores below 60 force human review; above 90 can auto-publish
- **Shorts rendering** — 9:16 variant of the renderer for each `shortIdea`
- **Multi-language** — Spanish, Portuguese, Korean for multilingual churches (Fielder runs bilingual already)
- **B-roll** — swap typographic slides for AI-generated background imagery (Runware/SDXL) per scene

---

## License

Internal / WinTech Partners / LifeStages AI
#   L i f e S t a g e s - M a n d M  
 