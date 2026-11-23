/** The player's sticky bottom bar, aligned with the reading column. */
export function PlayerBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-6 py-3">
        {children}
      </div>
    </div>
  )
}
