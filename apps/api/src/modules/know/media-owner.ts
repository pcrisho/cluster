import { randomUUID } from "crypto";
import { orgKeyPrefix } from "../storage/file-url";

/**
 * What a KNOW file belongs to. Every file of an owner lives in its folder:
 *   organizations/{orgId}/pages/{pageId}/…   or   organizations/{orgId}/spaces/{spaceId}/…
 * Types and limits come from the shared catalog (`storage/file-rules.ts`).
 */
export type MediaOwner = { kind: "page" | "space"; id: string };

export const pageOwner = (id: string): MediaOwner => ({ kind: "page", id });
export const spaceOwner = (id: string): MediaOwner => ({ kind: "space", id });

/** The owner of a document row; the database guarantees exactly one of the two is set. */
export function documentOwner(doc: {
  pageId: string | null;
  spaceId: string | null;
}): MediaOwner {
  return doc.pageId ? pageOwner(doc.pageId) : spaceOwner(doc.spaceId!);
}

export function ownerFolder(orgId: string, owner: MediaOwner): string {
  return `${orgKeyPrefix(orgId)}${owner.kind}s/${owner.id}/`;
}

/** Folder of the inline images of a page body or a space description. */
export function imageFolder(orgId: string, owner: MediaOwner): string {
  return `${ownerFolder(orgId, owner)}images/`;
}

export function buildImageKey(
  orgId: string,
  owner: MediaOwner,
  extension: string,
): string {
  return `${imageFolder(orgId, owner)}${randomUUID()}.${extension}`;
}
