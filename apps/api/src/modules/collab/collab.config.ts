import { Injectable } from "@nestjs/common";

/** Read on every access: e2e tests set these variables after the app is compiled. */
@Injectable()
export class CollabConfig {
  get url(): string {
    return process.env.COLLAB_URL || "http://localhost:3002";
  }

  /** Undefined when unset or empty, so the secret guard fails closed. */
  get secret(): string | undefined {
    return process.env.COLLAB_INTERNAL_SECRET || undefined;
  }

  get maxDocBytes(): number {
    const value = Number(process.env.COLLAB_MAX_DOC_BYTES);
    return Number.isInteger(value) && value > 0 ? value : 10 * 1024 * 1024;
  }
}
