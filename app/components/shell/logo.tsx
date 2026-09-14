/** The lock whose body carries a single level line: a condition held in one state. */
export function LogoMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M10 14V10a6 6 0 0 1 12 0v4" fill="none" stroke="#FF6B00" strokeWidth="3" />
      <rect x="6" y="14" width="20" height="14" fill="#FF6B00" />
      <path d="M11 21h10" stroke="#050505" strokeWidth="2.5" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="hidden text-[15px] font-semibold tracking-[0.18em] sm:inline" style={{ fontStretch: "118%" }}>
        STATELOCK
      </span>
    </span>
  );
}
