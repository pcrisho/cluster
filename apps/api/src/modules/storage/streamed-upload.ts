import {
  BadRequestException,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
} from "@nestjs/common";
import { createWriteStream } from "fs";
import { rm } from "fs/promises";
import type { IncomingHttpHeaders } from "http";
import { Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  MAX_BYTES,
  isCandidateFile,
  resolveFileType,
  type FileKind,
} from "@cluster/editor-schema";
import { readHead, sizeError, typeError } from "./file-rules";
import type { UploadGate } from "./upload-gate";
import { uploadTempPath } from "./upload-temp";

/** A file received to local disk; the caller stores it and then removes `path`. */
export interface ReceivedFile {
  path: string;
  size: number;
  /** The type it is stored as, decided by its content. */
  mime: string;
  extension: string;
  /** Gives the upload's slot and reserved room back: call it once the file is stored and removed. */
  release: () => void;
}

/**
 * Receives a request whose body is the file itself (no multipart) for files too big for memory
 * (lesson videos). The type and size are checked before reading; the body goes to a temporary
 * file with a byte counter, so a cut or oversized upload only costs that file, removed here. The
 * gate decides whether the API has room for it before a byte is read.
 */
export async function receiveFile(
  kind: FileKind,
  body: Readable & { headers: IncomingHttpHeaders },
  name: string,
  gate: UploadGate,
): Promise<ReceivedFile> {
  const declaredType = String(body.headers["content-type"] ?? "");
  if (!isCandidateFile(kind, name, declaredType))
    throw new BadRequestException(typeError(kind));
  const length = Number(body.headers["content-length"]);
  if (!body.headers["content-length"] || !Number.isSafeInteger(length))
    throw new HttpException(
      { code: "FILE_LENGTH_REQUIRED", message: "Send the file's size" },
      HttpStatus.LENGTH_REQUIRED,
    );
  if (length <= 0)
    throw new BadRequestException({
      code: "FILE_EMPTY",
      message: "The file is empty",
    });
  if (length > MAX_BYTES[kind])
    throw new PayloadTooLargeException(sizeError(kind));

  const release = await gate.acquire(length, "video");
  const path = uploadTempPath();
  let size = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > length) done(new PayloadTooLargeException(sizeError(kind)));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(body, counter, createWriteStream(path));
    const resolved = resolveFileType(
      kind,
      name,
      declaredType,
      await readHead(path),
    );
    if (!resolved) throw new BadRequestException(typeError(kind));
    return {
      path,
      size,
      mime: resolved.mime,
      extension: resolved.extension,
      release,
    };
  } catch (error) {
    await rm(path, { force: true });
    release();
    // The person cancelled or lost the connection: not a server error (a full disk still is).
    if ((error as { code?: string }).code === "ECONNRESET")
      throw new BadRequestException({
        code: "UPLOAD_INTERRUPTED",
        message: "The upload was interrupted",
      });
    throw error;
  }
}
