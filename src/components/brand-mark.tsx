/**
 * The Shortcraft mark (DesignPlan §4 B.1): an isometric box with an orange top,
 * a red left face and an ink right face carrying a play glyph. In dark mode the
 * right face turns blush (it follows --ink) and the glyph takes the ground
 * colour. Also src/app/icon.svg.
 */
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true" className="shrink-0">
      <path d="M26 4 46 14 26 24 6 14Z" fill="#F07142" />
      <path d="M6 14 26 24V48L6 38Z" fill="#F0354D" />
      <path d="M46 14 26 24V48L46 38Z" className="fill-ink" />
      <path d="M32 30 40 34.5 32 39Z" className="fill-paper" />
    </svg>
  );
}
