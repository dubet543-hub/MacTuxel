/** Original MacTuxel mark: a rounded tile with a 3×3 cell grid and an accent cell. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mtx-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#mtx-tile)" />
      <g fill="#ffffff">
        <rect x="13" y="13" width="11" height="11" rx="2.5" opacity="0.95" />
        <rect x="26.5" y="13" width="11" height="11" rx="2.5" opacity="0.95" />
        <rect x="40" y="13" width="11" height="11" rx="2.5" opacity="0.95" />
        <rect x="13" y="26.5" width="11" height="11" rx="2.5" opacity="0.6" />
        <rect x="40" y="26.5" width="11" height="11" rx="2.5" opacity="0.6" />
        <rect x="13" y="40" width="11" height="11" rx="2.5" opacity="0.6" />
        <rect x="26.5" y="40" width="11" height="11" rx="2.5" opacity="0.6" />
        <rect x="40" y="40" width="11" height="11" rx="2.5" opacity="0.6" />
      </g>
      <rect x="26.5" y="26.5" width="11" height="11" rx="2.5" fill="#fbbf24" />
    </svg>
  );
}
