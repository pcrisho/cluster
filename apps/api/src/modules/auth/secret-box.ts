import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/** AES-256-GCM: `iv.tag.ciphertext` in base64url. A changed byte or the wrong key fails to open. */
export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function open(box: string, key: Buffer): string {
  const [iv, tag, data] = box
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
