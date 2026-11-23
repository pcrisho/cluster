/** The value of one cookie in a `Cookie` header, or null. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  const pair = header
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return null;
  }
}
