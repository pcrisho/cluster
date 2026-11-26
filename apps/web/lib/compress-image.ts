import imageCompression from "browser-image-compression"

import { catalogType } from "@/lib/documents/file-types"

type CompressionOptions = {
  maxSizeMB?: number
  maxWidthOrHeight?: number
  useWebWorker?: boolean
  fileType?: string
}

const POST_OPTIONS: CompressionOptions = {
  maxSizeMB: 2,
  maxWidthOrHeight: 2048,
  useWebWorker: true,
}

const AVATAR_OPTIONS: CompressionOptions = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1024,
  useWebWorker: true,
}

const KNOW_OPTIONS: CompressionOptions = {
  maxSizeMB: 2,
  maxWidthOrHeight: 2560,
  useWebWorker: true,
}

export function compressForPost(file: File): Promise<File> {
  return imageCompression(file, POST_OPTIONS)
}

export function compressForAvatar(file: File): Promise<File> {
  return imageCompression(file, AVATAR_OPTIONS)
}

export interface CompressionPlan {
  /** Output type; omitted keeps the file's own. */
  fileType?: string
  /** Name of the compressed file, with an extension that matches its type. */
  name: string
}

/**
 * Whether a body image is recompressed, and to what. GIF passes untouched (the canvas would
 * keep only its first frame), and so does AVIF (browsers cannot encode it on a canvas, and it is
 * already small); BMP comes out as PNG, since the canvas does not encode BMP either. Anything
 * outside the inline images is not an image to compress.
 */
export function compressionPlan(
  file: Pick<File, "name" | "type">
): CompressionPlan | null {
  const type = catalogType(file)
  if (!type?.inline) return null
  switch (type.mime) {
    case "image/gif":
    case "image/avif":
      return null
    case "image/bmp":
      return { fileType: "image/png", name: withExtension(file.name, "png") }
    default:
      return { name: file.name }
  }
}

/**
 * Shrinks an image going into a KNOW page or a lesson text before it is uploaded: at most 2 MB
 * and 2560 px a side, re-encoded (which also drops the EXIF data, location included). If the
 * library fails the original is uploaded and the server's limit decides.
 */
export async function compressForKnow(file: File): Promise<File> {
  const plan = compressionPlan(file)
  if (!plan) return file
  try {
    const out = await imageCompression(file, {
      ...KNOW_OPTIONS,
      ...(plan.fileType ? { fileType: plan.fileType } : {}),
    })
    return new File([out], plan.name, {
      type: out.type || plan.fileType || file.type,
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}

function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf(".")
  return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`
}
