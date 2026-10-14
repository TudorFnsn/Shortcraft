/**
 * Search-facing copy for the public keyword landing pages (§6.3 of
 * TheMasterPlan: "AI TikTok video generator", "faceless video generator").
 * One entry per page; each route under `src/app/<slug>/page.tsx` renders its
 * entry with `components/keyword-page.tsx`, and the sitemap lists every slug.
 *
 * Every claim here must be true of the product today (no "unlimited", no
 * features we have not shipped). tests/seo checks lengths, uniqueness and that
 * every linked theme exists.
 */
export interface KeywordFaq {
  q: string;
  a: string;
}

export interface KeywordPage {
  /** URL path segment, also the route folder name. */
  slug: string;
  /** <title> without the brand suffix. */
  title: string;
  /** Meta description: 70–160 characters. */
  description: string;
  /** The page's H1. */
  heading: string;
  /** Two short paragraphs under the H1. */
  intro: readonly [string, string];
  /** "How it works" steps, in order. */
  steps: readonly string[];
  /** Theme ids featured as starting points (must exist in config/themes.ts). */
  themeIds: readonly string[];
  /** Questions people search, answered plainly; also emitted as FAQPage JSON-LD. */
  faq: readonly KeywordFaq[];
}

const SHARED_FAQ: readonly KeywordFaq[] = [
  {
    q: 'Is it free to try?',
    a: 'Yes. New accounts get free trial credits, enough for a first short video, and no card is needed. Trial videos carry a small "Made with Shortcraft" mark that disappears once you subscribe or buy credits.',
  },
  {
    q: 'Are the videos labelled as AI-generated?',
    a: 'Yes. Every video has a visible "AI-generated" tag and says so in its file metadata, which keeps you on the right side of platform rules and the EU AI Act.',
  },
];

export const KEYWORD_PAGES: readonly KeywordPage[] = [
  {
    slug: 'ai-tiktok-video-generator',
    title: 'AI TikTok video generator: idea to ready-to-post video',
    description:
      'Type an idea and get a narrated, captioned 9:16 TikTok video with AI scenes in minutes. Free credits to start, no card needed.',
    heading: 'AI TikTok video generator',
    intro: [
      'Posting every day is what grows a TikTok account, and making a video every day is the hard part. Shortcraft turns one line of text into a finished vertical video: script, pictures, voiceover and captions.',
      'You pick the idea and the style. The video comes out as a 9:16 MP4 you download and post to TikTok, Instagram Reels or YouTube Shorts.',
    ],
    steps: [
      'Type an idea, or pick one of ours.',
      'Choose a look (horror, fun facts, motivation and more), a length and a voice.',
      'Shortcraft writes the script, draws each scene, records the voiceover and adds word-by-word captions.',
      'Watch it, download the MP4 and post it.',
    ],
    themeIds: ['fun-facts', 'horror-story', 'story-time', 'comedy-skit'],
    faq: [
      {
        q: 'What does the AI TikTok video generator make?',
        a: 'A vertical 9:16 MP4 with a written script, an AI picture for each scene with gentle motion, a natural voiceover and word-by-word captions. Pro plans can animate every scene with AI video.',
      },
      {
        q: 'How long can the videos be?',
        a: 'From 15 seconds up to two minutes, depending on your plan. Most TikToks that hold attention are 15 to 60 seconds.',
      },
      {
        q: 'Can I change the voice?',
        a: 'Yes. Pick from a set of natural voices, make it slower or faster, and fix a line after the video is made without remaking the pictures.',
      },
      ...SHARED_FAQ,
    ],
  },
  {
    slug: 'faceless-video-generator',
    title: 'Faceless video generator for TikTok, Reels and Shorts',
    description:
      'Run a faceless channel without filming. Shortcraft writes, illustrates, narrates and captions each vertical video for you. Start free.',
    heading: 'Faceless video generator',
    intro: [
      'Faceless channels grow on a steady stream of stories, facts and explainers, without anyone stepping in front of a camera. The work is the writing, the visuals and the voice.',
      'Shortcraft does all three from a single idea, so a faceless channel becomes a few minutes a day instead of an afternoon of editing.',
    ],
    steps: [
      'Pick a format that suits your niche, from horror stories to mini documentaries.',
      'Type the topic, or take one of the ready-made ideas.',
      'Get a narrated, captioned video with an AI picture for every scene.',
      'Download it and post it on TikTok, Reels and Shorts.',
    ],
    themeIds: ['horror-story', 'mini-doc', 'motivation', 'fun-facts'],
    faq: [
      {
        q: 'What is a faceless video?',
        a: 'A video where nobody appears on camera: a voiceover tells the story over pictures or clips, with captions on screen. It is one of the most common formats on TikTok and YouTube Shorts.',
      },
      {
        q: 'Which faceless niches work best?',
        a: 'Scary stories, fun facts, motivation, short documentaries and first-person story time all do well, because the voice and the captions carry them. Each has its own look in Shortcraft.',
      },
      {
        q: 'Do I need to record my own voice?',
        a: 'No. Every video gets a natural AI voiceover, and you can choose the voice, its speed and how lively it sounds.',
      },
      ...SHARED_FAQ,
    ],
  },
];

export function keywordPage(slug: string): KeywordPage {
  const page = KEYWORD_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`Unknown keyword page: ${slug}`);
  return page;
}
