import type { Document, DocumentVersion } from "@prisma/client";
import { buildDocumentDownloadUrl } from "./document.constants";

/** A document as the web sees it: its owner (a page or a space) and its current version. */
export function toDocumentDto(doc: Document, current: DocumentVersion | null) {
  return {
    id: doc.id,
    pageId: doc.pageId,
    spaceId: doc.spaceId,
    name: doc.name,
    versionsCount: doc.versionsCount,
    // Every document has at least v1; the placeholder keeps the type non-nullable for the web.
    currentVersion: current
      ? toVersionDto(doc.id, current)
      : {
          id: "",
          version: 0,
          mimetype: "application/octet-stream",
          size: 0,
          url: "",
        },
    createdById: doc.createdById,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toVersionDto(documentId: string, v: DocumentVersion) {
  return {
    id: v.id,
    version: v.version,
    mimetype: v.mimetype,
    size: v.size,
    url: buildDocumentDownloadUrl(documentId, v.id),
  };
}
