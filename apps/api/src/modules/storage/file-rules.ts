import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { randomUUID } from "crypto";
import type { Request } from "express";
import { mkdir, open, rm } from "fs/promises";
import { diskStorage } from "multer";
import {
  MAX_BYTES,
  SIZE_ERROR,
  TYPE_ERROR,
  isCandidateFile,
  resolveFileType,
  type FileKind,
} from "@cluster/editor-schema";
import { catchError, concatMap, type Observable } from "rxjs";
import { UploadGate } from "./upload-gate";
import { UPLOAD_TEMP_PREFIX, uploadTmpDir } from "./upload-temp";

/**
 * Upload rules for every stored file: the catalog in `@cluster/editor-schema` decides the types,
 * limits and messages; this file applies them to multer and to the received bytes.
 *
 * - `image`: shown in a document body (KNOW pages and spaces, GROW lesson text).
 * - `document`: attached file (KNOW documents, GROW lesson files), received to the temp folder (50 MB
 *   in memory per upload took the API past 1 GB with eight at once, `scripts/perf/BASELINE.md`).
 * - `video`: a GROW lesson video, too big for memory: received by `streamed-upload.ts` instead.
 * - `spreadsheet`: a bulk import workbook (5 MB), read in memory by the import.
 */

/** Error bodies with a code the web translates; the message stays the catalog's English text. */
const TYPE_CODE: Record<FileKind, string> = {
  image: "IMAGE_TYPE_UNSUPPORTED",
  document: "FILE_TYPE_UNSUPPORTED",
  video: "VIDEO_TYPE_UNSUPPORTED",
  spreadsheet: "SPREADSHEET_TYPE_UNSUPPORTED",
};
const SIZE_CODE: Record<FileKind, string> = {
  image: "IMAGE_TOO_LARGE",
  document: "FILE_TOO_LARGE",
  video: "VIDEO_TOO_LARGE",
  spreadsheet: "SPREADSHEET_TOO_LARGE",
};
export const typeError = (kind: FileKind) => ({
  code: TYPE_CODE[kind],
  message: TYPE_ERROR[kind],
});
export const sizeError = (kind: FileKind) => ({
  code: SIZE_CODE[kind],
  message: SIZE_ERROR[kind],
  params: { maxMb: MAX_BYTES[kind] / (1024 * 1024) },
});

/** Multer turns an oversized file into "File too large"; this says the limit instead. */
class SizeMessageInterceptor implements NestInterceptor {
  constructor(private readonly kind: FileKind) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof PayloadTooLargeException) {
          throw new PayloadTooLargeException(sizeError(this.kind));
        }
        throw error;
      }),
    );
  }
}

/**
 * Holds a slot and room of the `UploadGate` while a document arrives to disk and is stored, then
 * removes the temporary file (multer removes it itself when the upload fails).
 */
@Injectable()
class DocumentGateInterceptor implements NestInterceptor {
  constructor(private readonly gate: UploadGate) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    // The multipart body is the file plus a little framing; an unannounced length reserves the maximum.
    const announced = Number(req.headers["content-length"]) || Infinity;
    const release = await this.gate.acquire(
      Math.min(announced, MAX_BYTES.document),
      "document",
    );
    // Done before the response leaves, success or error (release and rm are safe to repeat).
    const cleanup = async () => {
      release();
      if (req.file?.path)
        await rm(req.file.path, { force: true }).catch(() => undefined);
    };
    return next.handle().pipe(
      concatMap(async (value: unknown) => {
        await cleanup();
        return value;
      }),
      catchError(async (error: unknown) => {
        await cleanup();
        throw error;
      }),
    );
  }
}

/** Temporary files carry the streamed uploads' prefix, so `UploadTempSweeper` clears any a crash leaves. */
const toTempFolder = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = uploadTmpDir();
    mkdir(dir, { recursive: true }).then(
      () => cb(null, dir),
      (error: Error) => cb(error, dir),
    );
  },
  filename: (_req, _file, cb) =>
    cb(null, `${UPLOAD_TEMP_PREFIX}${randomUUID()}`),
});

/** Reads the `file` field with the limits of its kind; rejects unknown types before reading them. */
export function FileUpload(kind: FileKind) {
  const toDisk = kind === "document";
  return UseInterceptors(
    new SizeMessageInterceptor(kind),
    ...(toDisk ? [DocumentGateInterceptor] : []),
    FileInterceptor("file", {
      ...(toDisk && { storage: toTempFolder }),
      limits: { fileSize: MAX_BYTES[kind] },
      fileFilter: (_req, file, cb) => {
        if (isCandidateFile(kind, file.originalname, file.mimetype))
          cb(null, true);
        else cb(new BadRequestException(typeError(kind)), false);
      },
    }),
  );
}

export interface AcceptedFile {
  file: Express.Multer.File;
  /** The type the file is stored as, decided by its content, not by what the browser declared. */
  mime: string;
  /** Extension for the storage key. */
  extension: string;
  /** The file name as the person sees it (multer reads it as latin1; names with accents arrive as UTF-8 bytes). */
  name: string;
}

/** The first bytes of a file on disk: enough for every signature (`text` looks at 8 KB). */
export async function readHead(path: string): Promise<Buffer> {
  const head = Buffer.alloc(8192);
  const file = await open(path);
  const { bytesRead } = await file
    .read(head, 0, head.length, 0)
    .finally(() => file.close());
  return head.subarray(0, bytesRead);
}

/** Presence, size and content of an upload; throws 400/413 with a message for the user. */
export async function acceptFile(
  kind: FileKind,
  file: Express.Multer.File | undefined,
): Promise<AcceptedFile> {
  if (!file) throw new BadRequestException("file is required");
  if (file.size <= 0)
    throw new BadRequestException({
      code: "FILE_EMPTY",
      message: "The file is empty",
    });
  if (file.size > MAX_BYTES[kind])
    throw new PayloadTooLargeException(sizeError(kind));
  const resolved = resolveFileType(
    kind,
    file.originalname,
    file.mimetype,
    file.buffer ?? (await readHead(file.path)),
  );
  if (!resolved) throw new BadRequestException(typeError(kind));
  // Storage records `file.mimetype` as the object's type: store what the content is, not what was declared.
  file.mimetype = resolved.mime;
  const name = Buffer.from(file.originalname, "latin1").toString("utf8");
  return { file, mime: resolved.mime, extension: resolved.extension, name };
}
