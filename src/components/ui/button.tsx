import type { ButtonHTMLAttributes } from 'react';

/**
 * Boxes buttons (DesignPlan §4 B.1): no fill border, a 1px under-line, and they
 * press in by 2px on hover and keyboard focus (the `press` utility).
 *
 * - primary: the blush button, the one main action on a screen.
 * - ink: the dark button, for the main action on a blush box ("Make it").
 * - ember: the ember-gradient button; white text, so lg/xl sizes only (≥24px).
 * - secondary: a press-in link-button with no fill (Copy, Mark as posted).
 * - ghost: no line; tints on hover (close and icon buttons).
 */
type Variant = 'primary' | 'ink' | 'ember' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const base =
  'inline-flex items-center justify-center gap-2 rounded-button transition disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'press bg-blush text-on-blush [--press-line:#212121]',
  ink: 'press bg-[#212121] text-blush [--press-line:#000]',
  ember:
    'press text-white [background-color:#f0354d] [background-image:var(--grad-ember)] [--press-line:var(--shadow-red)]',
  secondary: 'press bg-transparent text-ink',
  ghost: 'bg-transparent text-ink hover:bg-ink/10',
};

/** Filled buttons speak in Fraunces from lg up (B.1: buttons 30–48). */
const sizes: Record<Size, { text: string; display: string }> = {
  sm: { text: 'min-h-11 px-4 text-[15px] font-semibold', display: '' },
  md: { text: 'min-h-11 px-5 text-[15px] font-semibold', display: '' },
  lg: {
    text: 'min-h-[54px] px-6 text-[17px] font-semibold',
    display: 'min-h-[54px] px-8 py-2 font-display text-[30px] leading-none font-light',
  },
  xl: {
    text: 'min-h-[64px] px-8 text-[19px] font-semibold',
    display:
      'min-h-[64px] px-8 py-3 font-display text-[32px] leading-none font-light sm:min-h-[80px] sm:text-[48px]',
  },
};

const filled = (v: Variant) => v === 'primary' || v === 'ink' || v === 'ember';

/** Class string for anything that should look like a button (e.g. a <Link>). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: { variant?: Variant; size?: Size; className?: string } = {}): string {
  // White on ember passes AA only at 24px and up, so ember is never small.
  const s = sizes[variant === 'ember' && (size === 'sm' || size === 'md') ? 'lg' : size];
  const type = filled(variant) && s.display ? s.display : s.text;
  return `${base} ${variants[variant]} ${type} ${className}`.trim();
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
