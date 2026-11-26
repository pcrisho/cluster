export type Log = (event: string, fields: Record<string, unknown>) => void

/** One JSON line per event: document, user and socket, never content or tokens. */
export const jsonLog: Log = (event, fields) => {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), event, ...fields })
  )
}
