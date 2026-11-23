// sharp is CommonJS (`export =`); the build has no esModuleInterop, so only this form works in both the build and Jest.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require("sharp");

/**
 * The organization's logo as bytes pdfkit can print. PNG and JPEG go through as they are; WebP, GIF
 * (first frame) and AVIF are turned into a PNG for this render only (nothing is stored). Anything else, or a
 * file that cannot be read, gives null and the certificate is text only.
 */
export async function logoForPdf(
  bytes: Buffer,
  key: string,
): Promise<Buffer | null> {
  const ext = /\.([a-z0-9]+)$/i.exec(key)?.[1]?.toLowerCase();
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return bytes;
  if (ext !== "webp" && ext !== "gif" && ext !== "avif") return null;
  try {
    return await sharp(bytes).png().toBuffer();
  } catch {
    return null;
  }
}
