const PALETTE = [
  "#e6194b",
  "#3cb44b",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#008080",
  "#9a6324",
  "#800000",
  "#808000",
  "#000075",
  "#d6336c",
  "#1c7ed6",
];

/** Stable cursor colour per user: the same id always maps to the same palette entry. */
export function collabColor(userId: string): string {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
