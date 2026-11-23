import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { createReadStream } from "fs";
import type { Readable } from "stream";
import { Client } from "minio";
import { fileTypeByName } from "@cluster/editor-schema";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: Client;

  constructor() {
    this.client = new Client({
      endPoint: process.env.STORAGE_HOST || "localhost",
      port: Number(process.env.STORAGE_PORT) || 9000,
      useSSL: process.env.STORAGE_USE_SSL === "true",
      accessKey: process.env.STORAGE_ACCESS_KEY || "cluster-storage",
      secretKey: process.env.STORAGE_SECRET_KEY || "cluster-storage-secret",
      // Streamed uploads (videos) hold about two parts in memory; buffers are sent whole either way.
      partSize: 8 * 1024 * 1024,
    });
  }

  async onModuleInit() {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    try {
      const bucketExists = await this.client.bucketExists(bucket);
      if (!bucketExists) {
        await this.client.makeBucket(bucket);
        this.logger.log(`Storage bucket "${bucket}" created successfully`);
      } else {
        this.logger.log(`Storage bucket "${bucket}" verified`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not verify/create bucket "${bucket}" on startup: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** Health check: the bucket answers. */
  ping(): Promise<boolean> {
    return this.client.bucketExists(process.env.STORAGE_BUCKET || "cluster");
  }

  /** Stores the file at exactly `key` (callers build org-scoped keys), from memory or, for documents, from disk. */
  async putObject(key: string, file: Express.Multer.File): Promise<void> {
    if (file.path)
      return this.putFile(key, file.path, file.size, file.mimetype);
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    await this.client.putObject(bucket, key, file.buffer, file.size, {
      "Content-Type": file.mimetype,
    });
  }

  /** Stores the file at `path` on local disk (a streamed upload) at exactly `key`. */
  async putFile(
    key: string,
    path: string,
    size: number,
    contentType: string,
  ): Promise<void> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    await this.client.putObject(bucket, key, createReadStream(path), size, {
      "Content-Type": contentType,
    });
  }

  /** Size in bytes; 404 when the object does not exist. */
  async fileSize(objectPath: string): Promise<number> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    const stat = await this.client
      .statObject(bucket, objectPath)
      .catch(notFound);
    return stat.size;
  }

  /** The whole object, or the inclusive byte range `range` of it. */
  async getFileStream(
    objectPath: string,
    range?: { start: number; end: number },
  ): Promise<{ stream: Readable; contentType: string }> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    const stream = await (
      range
        ? this.client.getPartialObject(
            bucket,
            objectPath,
            range.start,
            range.end - range.start + 1,
          )
        : this.client.getObject(bucket, objectPath)
    ).catch(notFound);
    return { stream, contentType: this.detectContentType(objectPath) };
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
    const keys: string[] = [];
    for await (const object of this.client.listObjectsV2(
      bucket,
      prefix,
      true,
    )) {
      if (object.name) keys.push(object.name);
    }
    if (keys.length > 0) await this.client.removeObjects(bucket, keys);
  }

  /** Every object whose key starts with `prefix`, with its last modification time. */
  async listObjects(
    prefix: string,
  ): Promise<{ name: string; lastModified: Date }[]> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    const found: { name: string; lastModified: Date }[] = [];
    for await (const object of this.client.listObjectsV2(
      bucket,
      prefix,
      true,
    )) {
      if (object.name && object.lastModified) {
        found.push({ name: object.name, lastModified: object.lastModified });
      }
    }
    return found;
  }

  async deleteFile(objectPath: string): Promise<void> {
    const bucket = process.env.STORAGE_BUCKET || "cluster";
    try {
      await this.client.removeObject(bucket, objectPath);
    } catch {
      // File may not exist — ignore
    }
  }
}

function notFound(err: { code?: string }): never {
  if (err.code === "NoSuchKey" || err.code === "NotFound")
    throw new NotFoundException("File not found");
  throw err;
}
