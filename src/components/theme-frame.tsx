import { lookFor } from './ideas';

/**
 * A drawn sample frame for a theme: its colours, a soft light, a hill and a
 * caption in the theme's voice. Stands in for a real sample still until those
 * are generated into public/themes (DesignPlan D1). Purely decorative.
 */
export function ThemeFrame({
  themeId,
  variant,
  caption = true,
  className = '',
}: {
  themeId: string;
  /** "card" = 4:5 crop for the theme picker; "phone" = full 9:16 preview. */
  variant: 'card' | 'phone';
  /** Draw the caption (off for small thumbnails). */
  caption?: boolean;
  className?: string;
}) {
  const look = lookFor(themeId);
  const phone = variant === 'phone';
  return (
    <span
      aria-hidden="true"
      className={`relative block overflow-hidden ${phone ? 'aspect-[9/16]' : 'aspect-[4/5] rounded-xl'} ${className}`.trim()}
      style={{ background: look.tint }}
    >
      <svg
        viewBox={phone ? '0 0 90 160' : '0 0 100 125'}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        {phone ? (
          <>
            <circle cx="64" cy="44" r="26" fill={look.glow} />
            <path d="M0 118 Q28 96 50 112 T90 102 V160 H0z" fill={look.ground} />
          </>
        ) : (
          <>
            <circle cx="72" cy="34" r="22" fill={look.glow} />
            <path d="M0 92 Q30 74 55 88 T100 80 V125 H0z" fill={look.ground} />
          </>
        )}
      </svg>
      {caption && (
        <span
          className={`font-display absolute font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.75)] ${
            phone
              ? 'inset-x-4 top-[56%] text-center text-xl leading-6'
              : 'inset-x-2.5 bottom-2.5 text-[13px] leading-tight lg:text-base'
          }`}
        >
          {look.caption}
        </span>
      )}
    </span>
  );
}
