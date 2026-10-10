/**
 * Terms of Service + Privacy Policy, as data. `/terms` and `/privacy` render
 * these; tests check them against the rest of the config (trial credits, plans,
 * the vendors that actually process data), so the policy can't silently drift
 * from what the product does.
 *
 * DRAFT: written for review by the owner (and ideally a lawyer) before live
 * payments. Operator details are placeholders until the legal entity exists;
 * `LEGAL_DRAFT` drives the visible "draft" banner on both pages.
 */
import { PLANS } from './plans';
import { siteConfig } from './site';

/** Bump when the Terms change materially; recorded with every checkout consent. */
export const TERMS_VERSION = '2026-10-10';
export const PRIVACY_VERSION = '2026-10-10';

/** True until the operator fields below are real and the text has been reviewed. */
export const LEGAL_DRAFT = true;

export const operator = {
  legalName: '[Operator legal name]',
  address: '[Registered address]',
  country: '[Country of establishment]',
  registration: '[Company / VAT number]',
  contactEmail: siteConfig.supportEmail,
} as const;

/**
 * The EU right of withdrawal (Consumer Rights Directive, Art. 16(m)) ends for
 * digital content only if the consumer expressly asks for immediate delivery
 * and acknowledges losing the right. `/pricing` requires this before checkout.
 */
export const WITHDRAWAL_WAIVER_TEXT =
  'I agree to the Terms and ask for my credits to be delivered right away. I understand that I lose my 14-day right of withdrawal once they are delivered.';

export interface LegalSection {
  /** Stable anchor, e.g. /terms#refunds. */
  id: string;
  heading: string;
  paragraphs: readonly string[];
}

export interface LegalDocument {
  title: string;
  version: string;
  sections: readonly LegalSection[];
}

const planList = Object.values(PLANS)
  .map((p) => `${p.name} (€${(p.priceCents / 100).toFixed(2)}/month)`)
  .join(', ');

/**
 * Vendors that process personal data for us. Keep in sync with the provider
 * registry and infrastructure; the privacy test fails if one is missing.
 */
export const SUBPROCESSORS = [
  { name: 'Supabase', purpose: 'accounts, database and file storage (EU, Ireland)' },
  { name: 'Vercel', purpose: 'hosting and running the app' },
  { name: 'Stripe', purpose: 'payments, invoices and subscriptions' },
  { name: 'Anthropic', purpose: 'writing video scripts from your topic' },
  { name: 'ElevenLabs', purpose: 'generating voiceovers from the script' },
  { name: 'fal.ai', purpose: 'generating scene images and AI video clips' },
] as const;

export const TERMS: LegalDocument = {
  title: 'Terms of Service',
  version: TERMS_VERSION,
  sections: [
    {
      id: 'who-we-are',
      heading: '1. Who we are',
      paragraphs: [
        `${siteConfig.name} is operated by ${operator.legalName}, ${operator.address}, ${operator.country} (${operator.registration}). Contact: ${operator.contactEmail}.`,
        `By creating an account or buying credits you agree to these Terms. If you do not agree, do not use ${siteConfig.name}.`,
      ],
    },
    {
      id: 'service',
      heading: '2. The service',
      paragraphs: [
        `${siteConfig.name} turns a topic you enter into a short vertical video: an AI-written script, AI-generated images or video clips, an AI voiceover, captions and a finished MP4. Results are generated automatically by third-party AI models and can be inaccurate, unexpected or similar to other people's results. Review every video before you publish it.`,
      ],
    },
    {
      id: 'accounts',
      heading: '3. Your account',
      paragraphs: [
        'You must be at least 16 years old to use the service. Keep your password safe; you are responsible for activity on your account. One person per account.',
      ],
    },
    {
      id: 'credits',
      heading: '4. Credits',
      paragraphs: [
        `Making a video costs credits. ${siteConfig.name} shows the maximum price before you start, holds that amount while the video is made and charges only what was used; the rest is returned. If a video fails, all held credits are returned automatically.`,
        `New accounts get ${siteConfig.trialCredits.toLocaleString('en')} free trial credits. Videos made only with trial credits carry a small "Made with ${siteConfig.name}" watermark; it is removed once you have made any purchase.`,
        'Credits have no cash value, cannot be transferred or exchanged for money, and are only for use on your own account. Credits currently do not expire while your account is open; we will give at least 30 days’ notice before introducing any expiry.',
      ],
    },
    {
      id: 'subscriptions',
      heading: '5. Plans, payment and cancellation',
      paragraphs: [
        `Plans: ${planList}. Each plan adds its monthly credits at the start of each billing period and renews automatically every month until you cancel. Top-ups are one-time credit purchases. Prices include VAT where it applies. Payments are processed by Stripe.`,
        'You can cancel at any time from the billing portal. Cancellation takes effect at the end of the current billing period; you keep that period’s credits and plan features until then, and you are not charged again. If you upgrade, the extra monthly credits are added immediately; a downgrade applies from the next period and never removes credits you already have.',
      ],
    },
    {
      id: 'refunds',
      heading: '6. Right of withdrawal and refunds',
      paragraphs: [
        'If you are a consumer in the EU/EEA you normally have 14 days to withdraw from a purchase. Credits are digital content delivered immediately: before checkout we ask you to request immediate delivery and confirm that you lose the right of withdrawal once the credits are delivered.',
        `Failed videos are refunded in credits automatically. Beyond that, if you were charged by mistake (for example, a renewal you forgot to cancel) and have not used any of the credits from that payment, email ${operator.contactEmail} within 14 days of the charge and we will refund it. Other refund requests are reviewed case by case. Nothing in these Terms limits your statutory rights.`,
      ],
    },
    {
      id: 'acceptable-use',
      heading: '7. Acceptable use',
      paragraphs: [
        'Do not use the service to create: sexual content involving minors (reported to the authorities); sexually explicit content; content that encourages self-harm; instructions for making weapons, explosives or drugs; calls for violence or hatred against people or groups; depictions of a real person saying or doing things they did not say or do, or impersonation; harassment, scams or misleading health and financial claims; or content that infringes someone else’s rights.',
        'Prompts are screened automatically before any credits are held, and the AI providers apply their own safety filters. We may refuse a request, remove content, or suspend accounts that break these rules.',
      ],
    },
    {
      id: 'ai-labelling',
      heading: '8. AI-generated content labels',
      paragraphs: [
        `Every video ${siteConfig.name} makes carries a visible "AI-generated" label and metadata saying it is AI-generated, as EU law requires. Do not remove or hide the label or metadata.`,
        'When you post a video on TikTok, YouTube, Instagram or any other platform, turn on that platform’s AI-generated / synthetic-content disclosure and follow its rules. Accounts that hide AI content risk removal by the platform, and you are responsible for what you publish.',
      ],
    },
    {
      id: 'ownership',
      heading: '9. Your content',
      paragraphs: [
        'You keep whatever rights you have in your prompts and in the videos made for you, to the extent the law allows rights in AI-generated material, and you may use them commercially. You give us the permission we need to store, process and show them to you in order to run the service. We do not use your prompts or videos to train AI models.',
        'Because results are generated automatically, we cannot promise that a video is unique or free of third-party rights. You are responsible for checking a video before you publish it.',
      ],
    },
    {
      id: 'availability',
      heading: '10. Availability and changes',
      paragraphs: [
        'We work to keep the service available, but we do not guarantee it will be uninterrupted or error-free. We may change or replace the AI models we use, or change features, when it keeps the service working or affordable. We will give at least 30 days’ notice by email of changes to prices or of material changes to these Terms; you can cancel before they apply.',
      ],
    },
    {
      id: 'liability',
      heading: '11. Liability',
      paragraphs: [
        'We are liable without limit for intent, gross negligence, and injury to life, body or health, and as required by mandatory consumer law. Otherwise our total liability is limited to the amount you paid us in the 12 months before the claim. We are not liable for how you use or publish videos, or for decisions platforms make about your accounts.',
      ],
    },
    {
      id: 'termination',
      heading: '12. Ending the agreement',
      paragraphs: [
        `You can stop using ${siteConfig.name} and ask us to delete your account at any time by emailing ${operator.contactEmail}. We may suspend or close accounts that seriously or repeatedly break these Terms; if we close your account without such a reason, we will refund unused purchased credits pro rata.`,
      ],
    },
    {
      id: 'law',
      heading: '13. Law and disputes',
      paragraphs: [
        `These Terms are governed by the laws of ${operator.country}. If you are a consumer, you also keep the protection of the mandatory laws of the country where you live and can bring claims there. The EU Online Dispute Resolution platform is at https://ec.europa.eu/consumers/odr.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: 'Privacy Policy',
  version: PRIVACY_VERSION,
  sections: [
    {
      id: 'controller',
      heading: '1. Who is responsible',
      paragraphs: [
        `The controller of your personal data is ${operator.legalName}, ${operator.address}, ${operator.country}. Contact for any privacy question: ${operator.contactEmail}.`,
      ],
    },
    {
      id: 'data',
      heading: '2. What we collect',
      paragraphs: [
        'Account: your email address and a password (stored only as a secure hash by our authentication provider).',
        'Content: the topics you enter, the scripts, images, clips, voiceovers and videos generated for you, and their settings.',
        'Billing: your plan, payments and credit history. Card details are entered on Stripe’s checkout page and never reach our servers.',
        'Technical: logs needed to run and secure the service (for example request times, errors and IP addresses). When a prompt is blocked by our safety screen we log only the category, not the prompt.',
      ],
    },
    {
      id: 'purposes',
      heading: '3. Why we use it',
      paragraphs: [
        'To provide the service you signed up for: making your videos, keeping your account and credits, and billing (GDPR Art. 6(1)(b), contract).',
        'To keep tax and accounting records (Art. 6(1)(c), legal obligation).',
        'To keep the service secure, prevent abuse and fix errors (Art. 6(1)(f), legitimate interests).',
        'We do not sell your data, show ads, or use your content to train AI models.',
      ],
    },
    {
      id: 'processors',
      heading: '4. Who processes it for us',
      paragraphs: [
        ...SUBPROCESSORS.map((s) => `${s.name}: ${s.purpose}.`),
        'Your topic and script are sent to the AI providers only to generate your video. Some of these providers are based in the United States; transfers are covered by the EU–US Data Privacy Framework or Standard Contractual Clauses.',
      ],
    },
    {
      id: 'retention',
      heading: '5. How long we keep it',
      paragraphs: [
        'Account data and your videos: until you delete them or close your account. Payment and invoice records: as long as tax law requires (typically up to 10 years). Technical logs: up to 30 days.',
      ],
    },
    {
      id: 'cookies',
      heading: '6. Cookies',
      paragraphs: [
        'We use only the cookies needed to keep you logged in. We do not use analytics or advertising cookies. If that changes, we will ask for your consent first, with an equally easy option to reject.',
      ],
    },
    {
      id: 'rights',
      heading: '7. Your rights',
      paragraphs: [
        `You can ask to access, correct, delete or export your data, or object to or restrict its use, by emailing ${operator.contactEmail}. We answer within one month. You can also complain to your local data protection authority.`,
      ],
    },
    {
      id: 'children',
      heading: '8. Children',
      paragraphs: [
        'The service is not meant for anyone under 16, and we do not knowingly collect their data.',
      ],
    },
    {
      id: 'changes',
      heading: '9. Changes',
      paragraphs: [
        'We will update this page when our practices change and email you about material changes.',
      ],
    },
  ],
};
