import { BadRequestException } from "@nestjs/common";
import {
  assertValidDoc,
  DOCUMENT_MAX_BYTES,
  InvalidDocError,
} from "@cluster/editor-schema";
import { embedUrl } from "./link-hosts";

export interface LessonFile {
  key: string;
  name: string;
  size: number;
}

/** A lesson is rich text, an uploaded video, an embedded video link or a list of files. */
export type LessonContent =
  | { kind: "text"; doc: unknown }
  | { kind: "video"; video: LessonFile }
  | { kind: "link"; url: string }
  | { kind: "files"; files: LessonFile[] };

/** The storage key of a lesson's uploaded video, if it has one. */
export function videoKeyOf(content: unknown): string | null {
  const value = content as Partial<Extract<LessonContent, { kind: "video" }>>;
  return value?.kind === "video" && typeof value.video?.key === "string"
    ? value.video.key
    : null;
}

export const EMPTY_LESSON: LessonContent = {
  kind: "text",
  doc: { type: "doc", content: [{ type: "paragraph" }] },
};

const MAX_FILES = 20;
const MAX_URL = 2000;
const MAX_NAME = 255;

/** Where a course's uploaded files live; draft deletion removes the whole prefix. */
export function courseFilePrefix(orgId: string, courseId: string): string {
  return `organizations/${orgId}/grow/${courseId}/`;
}

/**
 * Validates lesson content at the boundary and returns it without unknown fields. Throws 400.
 * A video lesson only keeps the video it already has (`current`): a video gets there by its upload.
 */
export function parseLessonContent(
  input: unknown,
  scope: { orgId: string; courseId: string; current?: unknown },
): LessonContent {
  const value = input as {
    kind?: unknown;
    doc?: unknown;
    url?: unknown;
    files?: unknown;
    video?: { key?: unknown };
  } | null;
  switch (value?.kind) {
    case "text":
      try {
        assertValidDoc(value.doc, { orgId: scope.orgId });
      } catch (error) {
        if (error instanceof InvalidDocError)
          throw new BadRequestException(`Lesson text: ${error.message}`);
        throw error;
      }
      return { kind: "text", doc: value.doc };
    case "video": {
      const current = scope.current as Extract<
        LessonContent,
        { kind: "video" }
      >;
      const key = videoKeyOf(current);
      if (!key || value.video?.key !== key)
        throw new BadRequestException(
          "Upload the video to the lesson; it cannot point at another file",
        );
      return { kind: "video", video: current.video };
    }
    case "link": {
      if (
        typeof value.url !== "string" ||
        value.url.length > MAX_URL ||
        embedUrl(value.url) === null
      ) {
        throw new BadRequestException(
          "Use a https link to YouTube, Vimeo, Google Drive, OneDrive, SharePoint (Stream, Teams) or Loom",
        );
      }
      return { kind: "link", url: value.url };
    }
    case "files": {
      if (!Array.isArray(value.files) || value.files.length > MAX_FILES) {
        throw new BadRequestException(
          `A lesson holds at most ${MAX_FILES} files`,
        );
      }
      const prefix = courseFilePrefix(scope.orgId, scope.courseId);
      const files = value.files.map(
        (f: { key?: unknown; name?: unknown; size?: unknown }) => {
          const ok =
            typeof f?.key === "string" &&
            f.key.startsWith(prefix) &&
            /^[\w-]+\.[a-z0-9]+$/.test(f.key.slice(prefix.length)) &&
            typeof f.name === "string" &&
            f.name.trim().length > 0 &&
            f.name.length <= MAX_NAME &&
            Number.isInteger(f.size) &&
            (f.size as number) >= 0 &&
            (f.size as number) <= DOCUMENT_MAX_BYTES;
          if (!ok)
            throw new BadRequestException(
              "Each file must be one uploaded to this course, with a name and size",
            );
          return {
            key: f.key as string,
            name: (f.name as string).trim(),
            size: f.size as number,
          };
        },
      );
      if (new Set(files.map((f) => f.key)).size !== files.length) {
        throw new BadRequestException("A file appears twice in the lesson");
      }
      return { kind: "files", files };
    }
    default:
      throw new BadRequestException(
        'Lesson content kind must be "text", "video", "link" or "files"',
      );
  }
}
