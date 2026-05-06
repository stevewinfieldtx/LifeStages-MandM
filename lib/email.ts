/**
 * Reviewer email notifications.
 * Uses Resend by default. Gracefully no-ops if RESEND_API_KEY is missing.
 */

export async function sendReviewEmail(args: {
  to: string;
  churchName: string;
  jobId: string;
  sermonTitle?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[email] Skipping notification — RESEND_API_KEY not set. ` +
      `Would notify ${args.to} about job ${args.jobId}.`
    );
    return;
  }

  const fromEmail = process.env.REVIEW_FROM_EMAIL ?? "mm@meaningfulmessage.app";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const reviewUrl = `${appUrl}/review/${args.jobId}`;

  const subject = args.sermonTitle
    ? `M&M ready for review — "${args.sermonTitle}"`
    : `Your Meaningful Message is ready for review — ${args.churchName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; max-width: 600px;">
      <h2 style="color:#111;">Your Meaningful Message is ready</h2>
      <p>We prepared this week's 10-minute digital companion for Sunday's sermon at <strong>${args.churchName}</strong>.</p>
      ${args.sermonTitle ? `<p><em>Sermon:</em> ${args.sermonTitle}</p>` : ""}
      <p style="margin:24px 0;">
        <a href="${reviewUrl}"
           style="background:#fbbf24;color:#111;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;">
          Review and approve
        </a>
      </p>
      <p style="color:#555;font-size:14px;">
        Nothing publishes until you approve it. You can edit the script before approving,
        or reject if it's not a fit.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0;" />
      <p style="color:#888;font-size:12px;">
        The Meaningful Message — part of the LifeStages AI platform.
      </p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `M&M <${fromEmail}>`,
        to: args.to,
        subject,
        html
      })
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[email] Resend failed (${res.status}):`, text);
    } else {
      console.log(`[email] Sent review notification for job ${args.jobId}`);
    }
  } catch (err) {
    console.error(`[email] Error sending review notification:`, err);
  }
}
