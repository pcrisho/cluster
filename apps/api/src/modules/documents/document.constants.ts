import { ownerFolder, type MediaOwner } from "../know/media-owner";
import { publicApiUrl } from "../storage/file-url";

/**
 * Build the storage key for a document version, inside its owner's folder:
 *   organizations/{orgId}/pages/{pageId}/documents/{documentId}/v{n}.{ext}
 *   organizations/{orgId}/spaces/{spaceId}/documents/{documentId}/v{n}.{ext}
 */
export function buildDocumentKey(
  orgId: string,
  owner: MediaOwner,
  documentId: string,
  version: number,
  extension: string,
): string {
  return `${ownerFolder(orgId, owner)}documents/${documentId}/v${version}.${extension}`;
}

/**
 * URL that streams the document version through the API
 * (the frontend always proxies through us — the bucket is not
 * exposed directly).
 */
export function buildDocumentDownloadUrl(
  documentId: string,
  versionId: string,
): string {
  return `${publicApiUrl()}/know/documents/${documentId}/versions/${versionId}/download`;
}
