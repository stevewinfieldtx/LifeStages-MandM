/**
 * Seed Fielder Church into the database.
 *
 * Usage:
 *   SEED_YT_CHANNEL_ID=UCxxxxx npx tsx scripts/seed-fielder.ts
 *
 * To find the channel ID:
 *   1. View page source at https://www.youtube.com/@FielderChurch
 *   2. Search for "channelId":"UC..."
 *   3. Copy that UC... value.
 */

import { query, queryOne, closePool } from "../lib/db";

async function main(): Promise<void> {
  const ytChannelId = process.env.SEED_YT_CHANNEL_ID;
  const reviewerEmail = process.env.SEED_REVIEWER_EMAIL ?? "stevewinfieldtx@gmail.com";

  if (!ytChannelId) {
    console.error("SEED_YT_CHANNEL_ID env var is required.");
    console.error("Example: SEED_YT_CHANNEL_ID=UCxxxxx npx tsx scripts/seed-fielder.ts");
    process.exit(1);
  }

  // Insert or update Fielder Church
  const church = await queryOne<{ id: string }>(
    `INSERT INTO churches (name, slug, denomination, reviewer_email)
     VALUES ('Fielder Church', 'fielder', 'Southern Baptist', $1)
     ON CONFLICT (slug) DO UPDATE SET
       reviewer_email = EXCLUDED.reviewer_email,
       name = EXCLUDED.name
     RETURNING id`,
    [reviewerEmail]
  );

  if (!church) throw new Error("Failed to upsert church.");

  // Attach the YouTube channel
  await query(
    `INSERT INTO channels (church_id, youtube_channel_id, youtube_handle)
     VALUES ($1, $2, '@FielderChurch')
     ON CONFLICT (church_id, youtube_channel_id) DO NOTHING`,
    [church.id, ytChannelId]
  );

  console.log("✓ Seeded Fielder Church");
  console.log(`  church_id: ${church.id}`);
  console.log(`  youtube:   ${ytChannelId}`);
  console.log(`  reviewer:  ${reviewerEmail}`);
  console.log("");
  console.log("Next: run the watcher to pick up the latest uploads:");
  console.log("  npx tsx workers/watcher/index.ts");
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("seed failed:", err);
    await closePool();
    process.exit(1);
  });
