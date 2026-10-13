/**
 * Lifecycle email content. Plain, short, one link each; every email carries
 * the one-click unsubscribe link. Pure: no env, no network.
 */
import { siteConfig } from '@/config/site';
import { createHref, dailyIdeas, dayKey } from '@/components/ideas';
import { ONE_VIDEO_CREDITS, type PlannedEmail } from './lifecycle';

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(paragraphs: string[], cta: { label: string; url: string }, unsubscribeUrl: string) {
  const text = [
    ...paragraphs,
    `${cta.label}: ${cta.url}`,
    `—\n${siteConfig.name}. Don't want these reminders? Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#faf7f2;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2b2420;font-size:16px;line-height:1.5">
<div style="max-width:480px;margin:0 auto">
${paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#c2571a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${escapeHtml(cta.label)}</a></p>
<p style="margin:32px 0 0;font-size:13px;color:#7a6e66">${escapeHtml(siteConfig.name)}. Don't want these reminders? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#7a6e66">Unsubscribe</a>.</p>
</div></body></html>`;
  return { text, html };
}

export function renderLifecycleEmail(
  email: PlannedEmail,
  opts: { siteUrl: string; unsubscribeUrl: string; now: Date },
): EmailContent {
  const idea = dailyIdeas(dayKey(opts.now))[0]!;
  const cta = { label: 'Make it now', url: `${opts.siteUrl}${createHref(idea)}` };

  if (email.kind === 'first_video') {
    return {
      subject: 'Your first video is one click away',
      ...layout(
        [
          `Your ${siteConfig.name} trial credits are still waiting: enough for your first video, free.`,
          `Need an idea? Try today's: “${idea.topic}” (${idea.themeLabel}). Pick a length, press Generate, and it's ready in about a minute, with script, voice and captions done for you.`,
        ],
        cta,
        opts.unsubscribeUrl,
      ),
    };
  }

  const balance = email.balance ?? 0;
  const videos = Math.floor(balance / ONE_VIDEO_CREDITS);
  return {
    subject: `You have ${balance.toLocaleString('en-US')} credits left this month`,
    ...layout(
      [
        `You haven't made a video this week. Your ${balance.toLocaleString('en-US')} credits cover about ${videos} more 15-second ${videos === 1 ? 'video' : 'videos'}.`,
        `Channels grow by posting often. Here's today's idea to keep yours moving: “${idea.topic}” (${idea.themeLabel}).`,
      ],
      cta,
      opts.unsubscribeUrl,
    ),
  };
}
