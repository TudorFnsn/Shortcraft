import type { MetadataRoute } from 'next';
import { DISALLOWED_PATHS, resolveSiteUrl } from '@/features/seo/site';

export default function robots(): MetadataRoute.Robots {
  const base = resolveSiteUrl(process.env);
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...DISALLOWED_PATHS] },
    sitemap: `${base}/sitemap.xml`,
  };
}
