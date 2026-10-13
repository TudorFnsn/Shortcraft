import type { MetadataRoute } from 'next';
import { resolveSiteUrl, sitemapEntries } from '@/features/seo/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(resolveSiteUrl(process.env));
}
