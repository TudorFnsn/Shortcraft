import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { getModel } from '@/config/models';
import {
  assetExtension,
  createInhouseRenderProvider,
  MAX_ASSET_BYTES,
  readAsset,
} from '@/features/providers/live/inhouse-render';
import { renderWithFfmpeg, type LocalRenderInput } from '@/features/providers/local/ffmpeg-render';
import { InMemoryMediaStore, mediaPath } from '@/features/providers/live/media-store';
import type { RenderInput } from '@/features/providers/types';

const model = getModel('render-default');
const ctx = { idempotencyKey: 'job_1:stitching:' };

const input: RenderInput = {
  clips: [
    {
      kind: 'still',
      imageUrl: 'https://media.test/images/a.jpg?token=x',
      motion: 'push-in',
      startMs: 0,
      durationMs: 2000,
    },
    { kind: 'video', videoUrl: 'https://media.test/clips/b.mp4', startMs: 2000, durationMs: 1000 },
  ],
  voiceoverUrl: 'https://media.test/voiceover/v.mp3',
  words: [{ word: 'hi', startMs: 0, endMs: 400 }],
  subtitleStyleId: 'bold-center',
  aspectRatio: '9:16',
  brandWatermark: true,
};

const okFetch = () =>
  vi.fn(async (url: string | URL | Request) => new Response(`bytes of ${String(url)}`));

/** Stands in for ffmpeg: checks the downloads landed, writes a fake MP4. */
function fakeRender(seen: LocalRenderInput[]) {
  return async (r: LocalRenderInput) => {
    seen.push(r);
    writeFileSync(r.outputPath, 'MP4');
    return { durationSec: 3 };
  };
}

describe('in-house render adapter', () => {
  it('downloads every asset, renders, and uploads the MP4 under the step key', async () => {
    const store = new InMemoryMediaStore();
    const fetchMock = okFetch();
    const seen: LocalRenderInput[] = [];
    const tmpRoot = mkdtempSync(join(tmpdir(), 'render-test-'));
    const provider = createInhouseRenderProvider(model, {
      store: () => store,
      fetch: fetchMock as unknown as typeof fetch,
      render: fakeRender(seen),
      tmpRoot,
    });

    const out = await provider.run(input, ctx);

    const key = mediaPath('renders', ctx.idempotencyKey, 'mp4');
    expect(out).toEqual({
      kind: 'completed',
      output: { videoUrl: `memory://${key}`, durationSec: 3 },
      costUsd: model.costUsdPerUnit,
    });
    expect(store.objects.get(key)?.contentType).toBe('video/mp4');
    expect(new TextDecoder().decode(store.objects.get(key)?.bytes)).toBe('MP4');
    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual(
      [
        'https://media.test/clips/b.mp4',
        'https://media.test/images/a.jpg?token=x',
        'https://media.test/voiceover/v.mp3',
      ].sort(),
    );
    const r = seen[0]!;
    expect(r.clips).toBe(input.clips);
    expect(r.words).toBe(input.words);
    expect(r.brandWatermark).toBe(true);
    expect(r.clipPaths.map((p) => p.split('/').pop())).toEqual(['clip0.jpg', 'clip1.mp4']);
    expect(r.voiceoverPath.endsWith('voiceover.mp3')).toBe(true);
    // Temp files are always cleaned up.
    expect(readdirSync(tmpRoot)).toEqual([]);
  });

  it('charges the flat catalog price per render', () => {
    const provider = createInhouseRenderProvider(model, { store: () => new InMemoryMediaStore() });
    expect(provider.costCredits(input)).toBe(model.creditsPerUnit);
  });

  it('fails the step (so the job refunds) and cleans up when anything breaks', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'render-test-'));
    const failingFetch = vi.fn(async () => new Response('gone', { status: 404 }));
    const cases = [
      { fetch: failingFetch, render: fakeRender([]), error: /download failed: 404/ },
      {
        fetch: okFetch(),
        render: async () => {
          throw new Error('ffmpeg exited 1');
        },
        error: /ffmpeg exited 1/,
      },
    ];
    for (const c of cases) {
      const store = new InMemoryMediaStore();
      const provider = createInhouseRenderProvider(model, {
        store: () => store,
        fetch: c.fetch as unknown as typeof fetch,
        render: c.render,
        tmpRoot,
      });
      await expect(provider.run(input, ctx)).rejects.toThrow(c.error);
      expect(store.objects.size).toBe(0);
      expect(readdirSync(tmpRoot)).toEqual([]);
    }
    const provider = createInhouseRenderProvider(model, { store: () => new InMemoryMediaStore() });
    await expect(provider.run({ ...input, clips: [] }, ctx)).rejects.toThrow(/at least one clip/);
  });

  it('is inline-only', async () => {
    const provider = createInhouseRenderProvider(model, { store: () => new InMemoryMediaStore() });
    await expect(provider.poll({ providerId: 'local:ffmpeg', providerJobId: 'x' })).rejects.toThrow(
      /inline/,
    );
  });
});

describe('render asset reading', () => {
  it('keeps known media extensions and ignores query strings', () => {
    expect(assetExtension('https://x.test/a/b.JPG?token=1')).toBe('jpg');
    expect(assetExtension('https://x.test/voice.mp3')).toBe('mp3');
    expect(assetExtension('https://x.test/object')).toBe('bin');
    expect(assetExtension('https://x.test/evil.sh')).toBe('bin');
  });

  it('reads file:// URLs only when allowed, and refuses other schemes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-asset-'));
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'local');
    const noFetch = vi.fn() as unknown as typeof fetch;
    const bytes = await readAsset(pathToFileURL(file).href, noFetch, true);
    expect(new TextDecoder().decode(bytes)).toBe('local');
    await expect(readAsset(pathToFileURL(file).href, noFetch)).rejects.toThrow(/cannot read/);
    await expect(readAsset('mock://image/a.png', noFetch)).rejects.toThrow(/cannot read/);
    await expect(readAsset('/etc/passwd', noFetch)).rejects.toThrow(/cannot read/);
  });

  it('refuses oversized downloads', async () => {
    const big = vi.fn(
      async () => new Response('x', { headers: { 'content-length': String(MAX_ASSET_BYTES + 1) } }),
    ) as unknown as typeof fetch;
    await expect(readAsset('https://x.test/huge.mp4', big)).rejects.toThrow(/too large/);
  });
});

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)('in-house render adapter with real ffmpeg', () => {
  it('renders a real MP4 from file:// assets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-real-'));
    const ff = (...args: string[]) =>
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    const image = join(dir, 'a.png');
    ff('-f', 'lavfi', '-i', 'color=c=blue:s=360x640:d=1', '-frames:v', '1', image);
    const voice = join(dir, 'v.mp3');
    ff('-f', 'lavfi', '-i', 'sine=frequency=330:duration=1', voice);

    const store = new InMemoryMediaStore();
    const provider = createInhouseRenderProvider(model, {
      store: () => store,
      allowFileUrls: true,
    });
    const out = await provider.run(
      {
        ...input,
        clips: [
          {
            kind: 'still',
            imageUrl: pathToFileURL(image).href,
            motion: 'pan-left',
            startMs: 0,
            durationMs: 1000,
          },
        ],
        voiceoverUrl: pathToFileURL(voice).href,
      },
      ctx,
    );
    expect(out.kind).toBe('completed');
    const mp4 = store.objects.get(mediaPath('renders', ctx.idempotencyKey, 'mp4'));
    // ISO BMFF: bytes 4..8 are "ftyp".
    expect(new TextDecoder().decode(mp4?.bytes.slice(4, 8))).toBe('ftyp');
  }, 60_000);

  // Windows temp dirs start with a drive letter ("C:\..."), and ffmpeg's filter
  // option parser splits on ':'. A ':' in a POSIX dir name hits the same parser.
  it.skipIf(process.platform === 'win32')(
    'renders when the work dir contains a colon (Windows drive letters)',
    async () => {
      const dir = join(mkdtempSync(join(tmpdir(), 'render-colon-')), 'C:work');
      mkdirSync(dir);
      const ff = (...args: string[]) =>
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
      const image = join(dir, 'a.png');
      ff('-f', 'lavfi', '-i', 'color=c=red:s=360x640:d=1', '-frames:v', '1', image);
      const voice = join(dir, 'v.mp3');
      ff('-f', 'lavfi', '-i', 'sine=frequency=330:duration=1', voice);
      const outputPath = join(dir, 'out.mp4');

      await renderWithFfmpeg({
        clips: [{ kind: 'still', imageUrl: 'x', motion: 'push-in', startMs: 0, durationMs: 1000 }],
        clipPaths: [image],
        voiceoverPath: voice,
        words: [{ word: 'hi', startMs: 0, endMs: 500 }],
        brandWatermark: false,
        workDir: dir,
        outputPath,
      });
      expect(new TextDecoder().decode(readFileSync(outputPath).subarray(4, 8))).toBe('ftyp');
    },
    60_000,
  );
});
