import type { SVGProps } from "react";

/**
 * The Autoresearch mark: two orbits crossing around a core. Keeps the upstream export name so every
 * surface that drew the T3 mark picks it up.
 */
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse
        cx="12"
        cy="12"
        rx="10.4"
        ry="4.6"
        transform="rotate(-38 12 12)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="10.4"
        ry="4.6"
        transform="rotate(38 12 12)"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <circle cx="12" cy="12" r="1.9" fill="var(--atr-corona, currentColor)" />
    </svg>
  );
}
