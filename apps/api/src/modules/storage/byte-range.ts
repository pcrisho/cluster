/** Inclusive byte positions of one `Range: bytes=…` request. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Reads a `Range` header for a file of `size` bytes (RFC 9110 §14): `null` serves the whole file
 * (no header, another unit, several ranges or a malformed one), `"unsatisfiable"` answers 416.
 */
export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    // Suffix: the last N bytes.
    const length = Number(match[2]);
    if (length === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(size - length, 0), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (match[2] && Number(match[2]) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end };
}
