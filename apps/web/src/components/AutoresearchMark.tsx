import type { SVGProps } from "react";

/**
 * Geometric event-horizon emblem for Autoresearch:
 * a precision-machined orbital ring, gravitational lens arc, and singularity core.
 */
export function AutoresearchMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9.25"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1.15"
      />
      <path
        d="M5.2 15.8C7.6 10.6 13.4 7.4 19.3 8.2"
        stroke="currentColor"
        strokeOpacity="0.92"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M18.8 8.2C16.4 13.4 10.6 16.6 4.7 15.8"
        stroke="var(--color-info)"
        strokeOpacity="0.88"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.15" fill="currentColor" />
      <circle
        cx="12"
        cy="12"
        r="4.4"
        stroke="var(--color-info)"
        strokeOpacity="0.34"
        strokeWidth="0.9"
      />
    </svg>
  );
}
