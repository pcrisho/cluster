/**
 * Feed mosaic for a post with two or more photos, as LinkedIn shows them: at most five tiles,
 * the first one larger when there are three or more, and "+N" on the last visible tile when
 * photos are left over. One photo is not a mosaic: it keeps its own shape (see `post-images.tsx`).
 */
export interface MosaicLayout {
  /** Tiles shown in the feed. */
  visible: number
  /** Classes of the frame: columns and the frame's aspect ratio. */
  frame: string
  /** Classes of the first tile, when it is larger than the others. */
  first: string
}

export function mosaicLayout(count: number): MosaicLayout {
  const visible = Math.min(count, 5)
  if (count >= 5) {
    return {
      visible,
      frame: "grid-cols-4 grid-rows-2 aspect-[4/3]",
      first: "col-span-2 row-span-2",
    }
  }
  if (count === 3) {
    return {
      visible,
      frame: "grid-cols-2 grid-rows-2 aspect-[4/3]",
      first: "row-span-2",
    }
  }
  if (count === 2) {
    return { visible, frame: "grid-cols-2 grid-rows-1 aspect-[8/5]", first: "" }
  }
  return { visible, frame: "grid-cols-2 grid-rows-2 aspect-[4/3]", first: "" }
}
