import { Logger } from "@nestjs/common"

const logger = new Logger("BestEffort")

/** Side effects (realtime events, notifications, file cleanup) must never fail the request that triggered them. */
export async function bestEffort(label: string, action: () => unknown): Promise<void> {
  try {
    await action()
  } catch (e) {
    logger.warn(`${label} failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}
