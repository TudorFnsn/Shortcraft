/**
 * Renders a ShareCard as a PNG with `next/og` (Satori). Shared by the root and
 * theme `opengraph-image` / `twitter-image` routes. Uses the built-in font, so
 * it needs no network at build time and works in mock mode.
 */
import { ImageResponse } from 'next/og';
import { siteConfig } from '@/config/site';
import { SHARE_CARD_SIZE, SHARE_COLORS, inkOn, type ShareCard } from '@/features/seo/share-card';

/** The cube mark from `app/icon.svg`, drawn with the same paths. */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52">
      <path d="M26 4 46 14 26 24 6 14Z" fill={SHARE_COLORS.orange} />
      <path d="M6 14 26 24V48L6 38Z" fill={SHARE_COLORS.ember} />
      <path d="M46 14 26 24V48L46 38Z" fill={SHARE_COLORS.ink} />
      <path d="M32 30 40 34.5 32 39Z" fill={SHARE_COLORS.blush} />
    </svg>
  );
}

export function shareCardImage(card: ShareCard): ImageResponse {
  const onAccent = inkOn(card.accent);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: SHARE_COLORS.blush,
        padding: 64,
        color: SHARE_COLORS.ink,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Mark size={72} />
        <div style={{ fontSize: 40, fontWeight: 700 }}>{siteConfig.name}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex' }}>
          <div
            style={{
              background: card.accent,
              color: onAccent,
              fontSize: 28,
              fontWeight: 700,
              padding: '8px 20px',
              borderRadius: 12,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            {card.eyebrow}
          </div>
        </div>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, maxWidth: 1000 }}>
          {card.headline}
        </div>
        <div style={{ fontSize: 34, color: '#424242', maxWidth: 1000, lineHeight: 1.3 }}>
          {card.subline}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {card.chips.map((chip) => (
          <div
            key={chip}
            style={{
              background: SHARE_COLORS.ink,
              color: SHARE_COLORS.paper,
              fontSize: 26,
              padding: '10px 22px',
              borderRadius: 999,
            }}
          >
            {chip}
          </div>
        ))}
      </div>
    </div>,
    SHARE_CARD_SIZE,
  );
}
