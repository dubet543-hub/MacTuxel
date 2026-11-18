import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/** Comma (thousands separator) style — not in the Lucide set, drawn to match it. */
export const CommaStyleIcon = forwardRef<SVGSVGElement, LucideProps>(function CommaStyleIcon(
  { size = 16, strokeWidth = 1.7, color = "currentColor", ...rest },
  ref,
) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M4 7h3v10" />
      <path d="M11 17c1.2 0 1.5-.8 1.5-2" />
      <path d="M15 8.5a2.5 2.5 0 0 1 5 0c0 2-5 3.5-5 8.5h5" />
    </svg>
  );
});
