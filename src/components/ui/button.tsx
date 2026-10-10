import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-button font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const variants: Record<Variant, string> = {
  // The one ember action on a screen.
  primary: 'bg-ember text-on-ember hover:brightness-95',
  secondary: 'border border-line-strong bg-raised text-ink hover:brightness-[.97]',
  ghost: 'text-ink hover:bg-raised',
};

const sizes: Record<Size, string> = {
  sm: 'h-10 px-4 text-[15px]',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-[54px] px-6 text-[17px]',
};

/** Class string for anything that should look like a button (e.g. a <Link>). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: { variant?: Variant; size?: Size; className?: string } = {}): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
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
