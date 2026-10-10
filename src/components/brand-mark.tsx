/** The Shortcraft mark: an ember rounded square with a play glyph (also src/app/icon.svg). */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="18" className="fill-ember" />
      <path
        d="M25 18.5v27L46 32z"
        className="fill-on-ember stroke-on-ember"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
