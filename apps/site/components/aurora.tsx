// The still brand wash with grain behind a section (globals.css `bg-aurora`, `bg-grain`).
export function Aurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
    >
      <div className="absolute inset-0 bg-aurora" />
      <div className="absolute inset-0 bg-grain" />
    </div>
  )
}
