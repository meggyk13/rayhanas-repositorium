// Pick a thumbnail for an index card.
//
// A `cover:` path in an entry's frontmatter always wins. Otherwise we use the
// first Markdown image in the body — the entries here open with their lead
// image, so that's the natural thumbnail. Entries with no images (most
// handouts) get null and the card renders text-only.

const IMG = /!\[[^\]]*\]\(\s*([^)\s]+)/;

export function coverImage(
  data: { cover?: string },
  body: string | undefined
): string | null {
  if (data.cover) return data.cover;
  const m = body?.match(IMG);
  return m ? m[1] : null;
}
