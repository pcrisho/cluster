import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream } from "fs";
import type { Readable } from "stream";
import { fileTypeByName } from "@cluster/editor-schema";

const MULTIPART_PART_BYTES = 8 * 1024 * 1024;
const DELETE_BATCH_SIZE = 1000;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client;

  constructor() {
    const protocol = process.env.STORAGE_USE_SSL === "true" ? "https" : "http";
    const host = process.env.STORAGE_HOST || "localhost";
    const port = Number(process.env.STORAGE_PORT) || 9000;
    this.client = new S3Client({
      region: "us-east-1",
      endpoint: `${protocol}://${host}:${port}`,
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || "cluster-storage",
        secretAccessKey:
          process.env.STORAGE_SECRET_KEY || "cluster-storage-secret",
      },
    });
  }

  async onModuleInit() {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      this.logger.log(`Storage bucket "${bucket}" verified`);
    } catch (error) {
      if (isNotFoundError(error)) {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
          this.logger.log(`Storage bucket "${bucket}" created successfully`);
          return;
        } catch (createError) {
          error = createError;
        }
      }
      this.logger.warn(
        `Could not verify/create bucket "${bucket}" on startup: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** Health check: the bucket answers. */
  async ping(): Promise<boolean> {
    await this.client.send(
      new HeadBucketCommand({ Bucket: process.env.STORAGE_BUCKET || "cluster" }),
    );
    return true;
  }

  /** Stores the file at exactly `key` (callers build org-scoped keys), from memory or, for documents, from disk. */
  async putObject(key: string, file: Express.Multer.File): Promise<void> {
    if (file.path)
      return this.putFile(key, file.path, file.size, file.mimetype);
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentLength: file.size,
        ContentType: file.mimetype,
      }),
    );
  }

  /** Stores the file at `path` on local disk (a streamed upload) at exactly `key`. */
  async putFile(
    key: string,
    path: string,
    size: number,
    contentType: string,
  ): Promise<void> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    const body = createReadStream(path);
    if (size <= MULTIPART_PART_BYTES) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentLength: size,
          ContentType: contentType,
        }),
      );
      return;
    }
    // Streamed uploads (videos) hold at most two 8 MB parts in memory.
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
      partSize: MULTIPART_PART_BYTES,
      queueSize: 2,
    });
    await upload.done();
  }

  /** Size in bytes; 404 when the object does not exist. */
  async fileSize(objectPath: string): Promise<number> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    const stat = await this.client
      .send(new HeadObjectCommand({ Bucket: bucket, Key: objectPath }))
      .catch(notFound);
    return Number(stat.ContentLength ?? 0);
  }

  /** The whole object, or the inclusive byte range `range` of it. */
  async getFileStream(
    objectPath: string,
    range?: { start: number; end: number },
  ): Promise<{ stream: Readable; contentType: string }> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    const res = await this.client
      .send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: objectPath,
          Range: range ? `bytes=${range.start}-${range.end}` : undefined,
        }),
      )
      .catch(notFound);
    if (!res.Body) throw new NotFoundException("File not found");
    return {
      stream: res.Body as Readable,
      contentType: this.detectContentType(objectPath),
    };
  }

  /** Type by extension: stored keys always end with the catalog's first extension for their type. */
  private detectContentType(objectPath: string): string {
    const lower = objectPath.toLowerCase();
    return (
      (fileTypeByName(lower) ?? fileTypeByName(lower, "video"))?.mime ??
      "application/octet-stream"
    );
  }

  /** Removes every object whose key starts with `prefix` (end it with "/" to stay inside one folder). */
  async deletePrefix(prefix: string): Promise<void> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    const objects = await this.listObjects(prefix);
    for (let i = 0; i < objects.length; i += DELETE_BATCH_SIZE) {
      const batch = objects.slice(i, i + DELETE_BATCH_SIZE);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map((o) => ({ Key: o.name })),
            Quiet: true,
          },
        }),
      );
    }
  }

  /** Every object whose key starts with `prefix`, with its last modification time. */
  async listObjects(
    prefix: string,
  ): Promise<{ name: string; lastModified: Date }[]> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    const found: { name: string; lastModified: Date }[] = [];
    let continuationToken: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of res.Contents ?? []) {
        if (object.Key && object.LastModified) {
          found.push({ name: object.Key, lastModified: object.LastModified });
        }
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
    return found;
  }

  async deleteFile(objectPath: string): Promise<void> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectPath }),
      );
    } catch {
      // File may not exist — ignore
    }
  }
}

function isNotFoundError(err: unknown): boolean {
  const e = err as {
    name?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    e?.name === "NotFound" ||
    e?.name === "NoSuchKey" ||
    e?.name === "NoSuchBucket" ||
    e?.code === "NotFound" ||
    e?.code === "NoSuchKey" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

function notFound(err: unknown): never {
  if (isNotFoundError(err)) throw new NotFoundException("File not found");
  throw err;
}
