import type { CSSProperties } from "react"

// Words enter one by one (globals.css `.blur-word`); `accent` continues the line in the accent face.
export function BlurText({ accent, text }: { accent?: string; text: string }) {
  const words = text.split(/\s+/)
  const accentWords = accent ? accent.split(/\s+/) : []

  const word = (
    value: string,
    index: number,
    last: boolean,
    className = ""
  ) => (
    <span key={`${value}-${index}`}>
      <span
        className={`blur-word ${className}`}
        style={{ "--blur-index": index } as CSSProperties}
      >
        {value}
      </span>
      {last ? null : " "}
    </span>
  )

  return (
    <>
      <span aria-hidden="true">
        {words.map((value, i) =>
          word(value, i, i === words.length - 1 && accentWords.length === 0)
        )}
        {/* From sm up the accent phrase starts its own line; on phones it flows. */}
        {accentWords.length > 0 && <br className="hidden sm:inline" />}
        {accentWords.map((value, i) =>
          word(
            value,
            words.length + i,
            i === accentWords.length - 1,
            "font-accent"
          )
        )}
      </span>
      <span className="sr-only">{accent ? `${text} ${accent}` : text}</span>
    </>
  )
}
