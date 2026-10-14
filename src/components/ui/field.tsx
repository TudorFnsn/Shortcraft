import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * The under-line field (DesignPlan §4 B.1): no box, a 1px line under Fraunces
 * 300 that thickens on focus. The label sits above in Inter; an error shows
 * on a blush strip in the deep red and is tied to the input for screen readers.
 */
export function Field({
  label,
  hint,
  error,
  large = false,
  hideLabel = false,
  className = '',
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** The 40px idea input (28px on phones); otherwise 24px form fields. */
  large?: boolean;
  hideLabel?: boolean;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      <label
        htmlFor={inputId}
        className={hideLabel ? 'sr-only' : 'text-ink-muted text-[13px] font-semibold'}
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`field-line text-ink w-full px-0.5 py-2 ${
          large ? 'text-[28px] sm:text-[40px]' : 'text-[24px]'
        }`}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-ink-muted m-0 text-[15px]">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="bg-blush m-0 rounded-[8px] px-3 py-2 text-[15px] text-[#a32435]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
