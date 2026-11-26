/** `moved` placed at `index` among `siblings` (which must not contain it); an index past the end means last. */
export function insertAt(
  siblings: readonly string[],
  moved: string,
  index: number,
): string[] {
  const at = Math.min(Math.max(index, 0), siblings.length);
  return [...siblings.slice(0, at), moved, ...siblings.slice(at)];
}
