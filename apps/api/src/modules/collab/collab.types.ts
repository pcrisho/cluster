import type { ModuleKey } from "@prisma/client";
import type { AuthenticatedUser } from "../../common/decorators";

export type CollabMode = "READ" | "WRITE";

export interface CollabFields {
  body: unknown;
  title: string;
}

export interface CollabStoreInput {
  ydoc: Buffer;
  fields: CollabFields;
  editors: string[];
}

/** Implemented by each feature that owns collaboratively edited documents (KNOW, later GROW). */
export interface CollabDocumentProvider {
  /** Prefix of the documentName, e.g. "know.page". */
  readonly kind: string;
  /** Feature module the documents belong to; users without it enabled get 403. */
  readonly module: ModuleKey;
  /** Organization that owns the document, or null when it does not exist. Reads without an organization context (system client): callers enter it with `withOrg` before any other method. */
  organizationOf(id: string): Promise<string | null>;
  /** Throws 404/403 when the user cannot open the document; otherwise returns the mode. */
  authorize(user: AuthenticatedUser, id: string): Promise<CollabMode>;
  /** Saved Yjs state (or null) and the derived fields to seed from. null when the document no longer exists. */
  load(id: string): Promise<{
    ydoc: Buffer | null;
    revision: number;
    fields: CollabFields;
  } | null>;
  /**
   * Seeds only when there is no state yet. Returns false if someone else did it first;
   * throws NotFoundException when the document no longer exists.
   */
  seed(id: string, ydoc: Buffer): Promise<boolean>;
  /**
   * Saves state and derived fields in one operation. Returns false when the document no longer
   * exists; throws UnprocessableEntityException when the fields are not valid. The organization
   * is always derived from the document itself, never taken from the caller.
   */
  store(id: string, input: CollabStoreInput): Promise<boolean>;
}
