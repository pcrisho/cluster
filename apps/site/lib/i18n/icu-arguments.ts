const BRANCHING = new Set(["plural", "select", "selectordinal"])

/**
 * The argument names an ICU message uses ("{count, plural, one {# {name}} other {…}}" → count, name).
 * Enough to check that a translation keeps its placeholders; it does not validate the syntax.
 */
export function icuArguments(message: string): Set<string> {
  const names = new Set<string>()
  let i = 0

  const readUntil = (stops: string) => {
    const start = i
    while (i < message.length && !stops.includes(message[i]!)) i++
    return message.slice(start, i).trim()
  }

  /** Text up to the "}" that closes the current block, collecting arguments inside it. */
  const text = () => {
    while (i < message.length && message[i] !== "}") {
      if (message[i] === "{") argument()
      else i++
    }
  }

  const argument = () => {
    i++ // "{"
    const name = readUntil(",}")
    if (name) names.add(name)
    if (message[i] === ",") {
      i++
      const type = readUntil(",}")
      if (BRANCHING.has(type) && message[i] === ",") {
        i++
        while (i < message.length && message[i] !== "}") {
          readUntil("{}") // a selector such as "one", "=0", "other" (and an "offset:1")
          if (message[i] === "{") {
            i++
            text()
            i++ // "}"
          }
        }
      } else {
        let depth = 0
        while (i < message.length && (message[i] !== "}" || depth > 0)) {
          if (message[i] === "{") depth++
          if (message[i] === "}") depth--
          i++
        }
      }
    }
    i++ // "}"
  }

  while (i < message.length) {
    if (message[i] === "{") argument()
    else i++
  }
  return names
}
