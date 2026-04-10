import { cn } from '@/lib/utils'

type LogoMarkProps = {
  className?: string
  'aria-label'?: string
}

// The RaceDash R-mark. Lifted verbatim from apps/desktop/src/assets/logo-path.svg
// so the marketing site and the desktop app stay pixel-identical. The mark is
// a stencil R whose bowl is a tick-marked chronograph and whose diagonal leg
// is the accent-blue second hand.
//
// Colors are hardcoded to the brand palette (matches the desktop asset).
// Viewbox matches the source SVG exactly.
export function LogoMark({ className, 'aria-label': ariaLabel }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 179.496 257.624"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      role="img"
      aria-label={ariaLabel ?? 'RaceDash'}
      className={cn('h-full w-auto', className)}
    >
      <g transform="matrix(1.064,0,0,1.064,276.773,-1.288)" fill="none">
        {/* Diagonal stroke of the R — the chronograph's second hand, in brand accent */}
        <path
          d="m -219.199,98.461 79.498,131.917"
          stroke="#8CC8FF"
          strokeWidth="22"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Main R body: vertical stroke + top arc forming the bowl */}
        <path
          d="m -247.149,230.378 -0.018,-208 h 58 c 46,0 75,29 75,72 0,43 -29,72 -75,72 h -14.555"
          stroke="#E8F3FF"
          strokeWidth="26"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Pusher crown details */}
        <path d="m -128.098,37.57 16.488,-15.148" stroke="#E8F3FF" strokeWidth="14" strokeLinecap="round" />
        <rect x="-81.802" y="77.669" width="36" height="20" rx="10" fill="#E8F3FF" transform="rotate(45)" />
        <rect
          x="76.578"
          y="57.595"
          width="1.856"
          height="17.815"
          rx="0.928"
          fill="#8CC8FF"
          transform="matrix(-0.686,0.727,-0.711,-0.703,0,0)"
          opacity="0.9"
        />
        {/* Chronograph tick marks around the bowl */}
        <path d="m -168.167,58.005 5,-8.66" stroke="#E8F3FF" strokeWidth="3.376" strokeLinecap="round" opacity="0.68" />
        <path
          d="m -159.921,59.523 4.179,-4.979"
          stroke="#E8F3FF"
          strokeWidth="3.376"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="m -154.312,65.131 4.979,-4.178"
          stroke="#E8F3FF"
          strokeWidth="3.376"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path d="m -152.794,73.378 8.66,-5" stroke="#E8F3FF" strokeWidth="3.376" strokeLinecap="round" opacity="0.68" />
        <path
          d="m -146.411,78.816 6.108,-2.223"
          stroke="#E8F3FF"
          strokeWidth="3.376"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="m -144.359,86.477 6.402,-1.129"
          stroke="#E8F3FF"
          strokeWidth="3.376"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path d="m -147.167,94.378 h 10" stroke="#E8F3FF" strokeWidth="3.376" strokeLinecap="round" opacity="0.68" />
        <path
          d="m -144.359,102.279 6.402,1.129"
          stroke="#E8F3FF"
          strokeWidth="3.376"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="m -146.411,109.94 6.108,2.223"
          stroke="#E8F3FF"
          strokeWidth="3.376"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path d="m -152.794,115.378 8.66,5" stroke="#E8F3FF" strokeWidth="3.376" strokeLinecap="round" opacity="0.68" />
        <path
          d="m -154.312,123.625 4.979,4.178"
          stroke="#E8F3FF"
          strokeWidth="3.376"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="m -159.921,129.233 4.179,4.979"
          stroke="#E8F3FF"
          strokeWidth="3.376"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path d="m -168.167,130.751 5,8.66" stroke="#E8F3FF" strokeWidth="3.376" strokeLinecap="round" opacity="0.68" />
      </g>
    </svg>
  )
}
