/** Storage keys (`organizations/<org>/…`) of the images in a document; images that are https links hold no file of ours. */
export function collectImageKeys(doc: unknown): Set<string> {
  const keys = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const { type, attrs, content } = node as {
      type?: unknown;
      attrs?: { src?: unknown };
      content?: unknown;
    };
    if (
      type === "image" &&
      typeof attrs?.src === "string" &&
      attrs.src.startsWith("organizations/")
    ) {
      keys.add(attrs.src);
    }
    if (Array.isArray(content)) content.forEach(walk);
  };
  walk(doc);
  return keys;
}
