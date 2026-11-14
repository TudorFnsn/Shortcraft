import { describe, expect, it } from 'vitest';
import { fabVisible, isMarketingPath, signedInLinks } from '@/components/shell-paths';

describe('Boxes shell rules (DesignPlan B.2)', () => {
  it('gives the big dark footer to landing, pricing, legal, keyword and ideas pages', () => {
    for (const p of [
      '/',
      '/pricing',
      '/terms',
      '/privacy',
      '/ideas',
      '/ideas/horror-story',
      '/ai-tiktok-video-generator',
      '/faceless-video-generator',
      '/ai-youtube-shorts-generator',
      '/ai-story-video-generator',
    ]) {
      expect(isMarketingPath(p)).toBe(true);
    }
    for (const p of ['/create', '/gallery', '/voices', '/voices/new', '/login', '/pricingx']) {
      expect(isMarketingPath(p)).toBe(false);
    }
  });

  it('links to the page you are not on', () => {
    expect(signedInLinks('/gallery')).toEqual(['create']);
    expect(signedInLinks('/create')).toEqual(['videos']);
    expect(signedInLinks('/voices')).toEqual(['videos', 'create']);
  });

  it('shows the phone + on Your videos and voices only', () => {
    expect(fabVisible('/gallery')).toBe(true);
    expect(fabVisible('/voices/new')).toBe(true);
    expect(fabVisible('/create')).toBe(false);
    expect(fabVisible('/pricing')).toBe(false);
  });
});
