/**
 * Vox mark — a book-V letterform with a spark, inside an accent-tinted
 * squircle. Used wherever the study companion speaks for itself.
 */
export default function VoxIcon({
  size = 16,
  withBadge = false,
  className = "",
}: {
  size?: number;
  /** Render inside a tinted squircle (headers, thinking card). */
  withBadge?: boolean;
  className?: string;
}) {
  const glyph = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* V letterform — open book silhouette */}
      <path
        d="M4.5 6.2c0-.8.65-1.4 1.42-1.3l4.33.55c.5.06.85.5.85 1v10.1c0 .55-.62.88-1.08.58L4.5 13.3V6.2Z"
        fill="var(--color-accent)"
      />
      <path
        d="M19.5 6.2c0-.8-.65-1.4-1.42-1.3l-4.33.55c-.5.06-.85.5-.85 1v10.1c0 .55.62.88 1.08.58l5.52-3.83V6.2Z"
        fill="var(--color-accent)"
        opacity="0.65"
      />
      {/* Spark — the thinking bit, top right */}
      <path
        d="M18.9 2.6c.22 1.5 1 2.28 2.5 2.5-1.5.22-2.28 1-2.5 2.5-.22-1.5-1-2.28-2.5-2.5 1.5-.22 2.28-1 2.5-2.5Z"
        fill="var(--color-warmth)"
      />
    </svg>
  );

  if (!withBadge) return glyph;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full ${className}`}
      style={{
        width: size + 16,
        height: size + 16,
        backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)",
      }}
    >
      {glyph}
    </span>
  );
}
