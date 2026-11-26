import { Injectable, NotFoundException } from "@nestjs/common";
import type { CollabDocumentProvider } from "./collab.types";

@Injectable()
export class CollabRegistry {
  private readonly providers = new Map<string, CollabDocumentProvider>();

  register(provider: CollabDocumentProvider): void {
    if (this.providers.has(provider.kind)) {
      throw new Error(
        `Collab document kind already registered: ${provider.kind}`,
      );
    }
    this.providers.set(provider.kind, provider);
  }

  get(kind: string): CollabDocumentProvider {
    const provider = this.providers.get(kind);
    if (!provider) throw new NotFoundException("Unknown document kind");
    return provider;
  }
}
