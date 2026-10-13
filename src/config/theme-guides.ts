/**
 * Search-facing copy for the public theme pages (`/ideas/<theme>`). One guide per
 * theme in `config/themes.ts`, each written for what people actually type
 * ("horror story ideas for TikTok", "faceless motivation channel"), so every
 * page has its own text rather than a template with the label swapped in.
 *
 * Plain data: the page and the sitemap read it, and tests/seo checks that every
 * theme has one and that titles/descriptions fit what search results show.
 */
export interface ThemeGuide {
  /** <title> without the brand suffix. */
  title: string;
  /** Meta description: 70–160 characters. */
  description: string;
  /** The page's H1. */
  heading: string;
  /** Two short paragraphs under the H1. */
  intro: readonly [string, string];
  /** Three tips for this format, shown as a list. */
  tips: readonly [string, string, string];
}

export const THEME_GUIDES: Record<string, ThemeGuide> = {
  'office-drama': {
    title: 'Office drama video ideas for TikTok, Reels and Shorts',
    description:
      'Ready-made office drama ideas for faceless short videos. Pick one and get a narrated, captioned 9:16 video with AI scenes in minutes.',
    heading: 'Office drama video ideas',
    intro: [
      'Workplace stories are relatable: everyone has met the fridge-labeller and sat through the meeting that should have been an email. That is why they get comments and shares.',
      'Pick an idea below and Shortcraft writes the script, draws each scene, records the narration and adds captions.',
    ],
    tips: [
      'Open with the moment it went wrong, then rewind.',
      'Keep one villain and one victim; side characters slow it down.',
      'End on the petty payoff, not a lesson.',
    ],
  },
  'horror-story': {
    title: 'Scary story ideas for TikTok and Shorts: AI horror videos',
    description:
      'Short horror story ideas for faceless channels. Turn one into a narrated, captioned vertical video with eerie AI scenes, ready to post.',
    heading: 'Horror story video ideas',
    intro: [
      'Short horror is one of the most-watched faceless formats: a calm voice, dark frames and a twist in the last seconds keep people watching to the end.',
      'Pick an idea and Shortcraft writes the script, draws each scene in a dark palette, records the narration and adds word-by-word captions.',
    ],
    tips: [
      'Start in the middle of something wrong, not with the setup.',
      'One rule that breaks is scarier than a monster.',
      'Save the twist for the final scene and stop right after it.',
    ],
  },
  'fun-facts': {
    title: 'Fun facts video ideas for TikTok, Reels and Shorts',
    description:
      'Did-you-know ideas for faceless fact channels. Turn one into a captioned, narrated 9:16 video with an AI image for every fact.',
    heading: 'Fun facts video ideas',
    intro: [
      'Fact videos are the easiest faceless format to post every day: one surprising claim, a quick explanation and a picture for each point.',
      'Pick an idea and Shortcraft writes a tight script, draws a scene for each fact, records the voice and adds captions.',
    ],
    tips: [
      'Lead with the most unbelievable fact, not the most important one.',
      'Three facts fit a 15–30 second video; more feels rushed.',
      'End with a question to get comments.',
    ],
  },
  'life-hack': {
    title: 'Life hack video ideas for faceless TikTok and Shorts',
    description:
      'Quick life hack ideas for short videos. Get a narrated, captioned vertical video showing one clever trick, made with AI in minutes.',
    heading: 'Life hack video ideas',
    intro: [
      'Life hacks get saved and shared because they are useful. The best ones show one trick, quickly, with a clear before and after.',
      'Pick an idea and Shortcraft writes the steps, draws each one, records the voice and adds captions you can follow on mute.',
    ],
    tips: [
      'Name the annoying problem in the first two seconds.',
      'One hack per video; a list of ten gets skipped.',
      'Show the result last, so people watch to the end.',
    ],
  },
  motivation: {
    title: 'Motivational video ideas for faceless TikTok and Shorts',
    description:
      'Motivational video ideas for faceless channels. Get a cinematic, narrated 9:16 video with captions and AI scenes, ready for TikTok and Reels.',
    heading: 'Motivation video ideas',
    intro: [
      'Motivation channels run on short, punchy narration over cinematic images. The format is simple, which is why consistent daily posting matters more than production.',
      'Pick an idea and Shortcraft writes the speech, draws cinematic scenes, records a deep narration and adds bold captions.',
    ],
    tips: [
      'Open with a hard truth, not a quote.',
      'Short sentences read better as captions.',
      'Finish with one instruction the viewer can do today.',
    ],
  },
  'mini-doc': {
    title: 'Mini documentary ideas for YouTube Shorts and TikTok',
    description:
      'Mini documentary ideas for faceless explainer channels. Turn a topic into a calm, narrated vertical video with captions and AI visuals.',
    heading: 'Mini documentary video ideas',
    intro: [
      'Mini documentaries explain one odd piece of history or how something works in under a minute. People watch them to the end because they want the answer.',
      'Pick an idea and Shortcraft writes a narrated explainer, draws each scene, records a calm voice and adds captions.',
    ],
    tips: [
      'Ask the question in the first line and answer it in the last.',
      'One story per video; save the tangents for the next one.',
      'Use 45–60 seconds when the story needs it.',
    ],
  },
  'comedy-skit': {
    title: 'Comedy skit ideas for TikTok and Shorts, made with AI',
    description:
      'Absurd comedy skit ideas for faceless channels. Get a narrated, captioned 9:16 video with AI scenes and a punchline, no filming needed.',
    heading: 'Comedy skit video ideas',
    intro: [
      'Absurd premises (a pigeon at a job interview, a fridge with opinions) work without a face on camera, because the joke is the idea itself.',
      'Pick an idea and Shortcraft writes the skit, draws each scene, records the narration and adds captions timed to the punchline.',
    ],
    tips: [
      'State the absurd premise straight away.',
      'Play it completely seriously; that is the joke.',
      'End on the punchline. No outro.',
    ],
  },
  'story-time': {
    title: 'Story time video ideas for faceless TikTok and Reels',
    description:
      'Story time ideas told in the first person. Get a dramatic, narrated vertical video with captions and AI scenes, ready for TikTok and Reels.',
    heading: 'Story time video ideas',
    intro: [
      'First-person stories ("so I moved in with a stranger…") keep people watching because they want to know how it ends.',
      'Pick an idea and Shortcraft writes the story, draws each scene, records the narration and adds captions.',
    ],
    tips: [
      'Start with the strangest moment, then explain how you got there.',
      'Use "I" and specific details; vague stories get skipped.',
      'Leave a small twist for the last line.',
    ],
  },
};
