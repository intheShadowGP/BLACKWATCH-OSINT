export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="bwg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c42f37" />
          <stop offset="1" stopColor="#5e0f14" />
        </linearGradient>
      </defs>
      <path d="M32 3 58 13v18c0 15-11 26-26 30C17 57 6 46 6 31V13Z" fill="#0d0d0f" stroke="url(#bwg)" strokeWidth="3" />
      <path d="M14 32c5-8 11-12 18-12s13 4 18 12c-5 8-11 12-18 12s-13-4-18-12Z" fill="none" stroke="#c9a54a" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="6.5" fill="#c42f37" />
      <circle cx="32" cy="32" r="2.4" fill="#0d0d0f" />
    </svg>
  );
}
