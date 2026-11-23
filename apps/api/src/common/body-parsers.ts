import type { INestApplication } from "@nestjs/common";
import { json, urlencoded } from "express";

/**
 * Replaces Nest's default body parser (100 kb). Yjs documents reach the internal collab
 * routes base64-encoded (up to ~13.4 MB), so that prefix gets its own, larger limit first.
 * express's json() skips requests an earlier json() already parsed.
 */
export function configureBodyParsers(app: INestApplication): void {
  app.use("/api/v1/internal/collab", json({ limit: "14mb" }));
  // Markdown import: up to 500k characters, which is more than 100 kb once encoded.
  app.use(
    /^\/api\/v1\/know\/spaces\/[^/]+\/pages\/import$/,
    json({ limit: "2mb" }),
  );
  // LMS step content (lesson documents, quiz questions): up to 1 MB.
  app.use(
    /^\/api\/v1\/grow\/(sections\/[^/]+\/steps|steps\/[^/]+)$/,
    json({ limit: "1mb" }),
  );
  // Quiz answers: up to 200 written answers of 5 000 characters.
  app.use(/^\/api\/v1\/grow\/attempts\/[^/]+\/submit$/, json({ limit: "1mb" }));
  app.use(json({ limit: "100kb" }));
  app.use(urlencoded({ extended: true, limit: "100kb" }));
}
