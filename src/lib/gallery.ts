// Pull every image out of the A&S entries for the gallery page.
//
// Each Markdown image `![alt](/images/...)` becomes one gallery item. The alt
// text is the description. For period art and extant pieces, the caption line
// under the image (if any) is shown as the citation when it adds something the
// alt text doesn't already say.

import { imageKinds, imageCites, type GalleryKind } from '../data/gallery';

export type GalleryItem = {
  src: string;
  alt: string;
  cite: string | null;
  kind: GalleryKind;
  tags: string[];
  entryTitle: string;
  entryHref: string;
};

const IMG = /!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/;

// "Fig 1.", "Fig. 2", "*...*", [text](url) → plain text
function clean(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^fig\.?\s*\d+\.?\s*/i, '')
    .trim();
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const PERIOD =
  /codex|kostümbuch|kostumbuch|manierenbuch|museum|album|nicolay|miniature|\b1[0-6]\d\d\b/i;

function guessKind(alt: string, caption: string): GalleryKind {
  return PERIOD.test(alt + ' ' + caption) ? 'art' : 'mine';
}

export function imagesFromEntry(entry: {
  id: string;
  body?: string;
  data: { title: string; tags: string[] };
}): GalleryItem[] {
  const lines = (entry.body ?? '').split(/\r?\n/);
  const items: GalleryItem[] = [];

  lines.forEach((line, i) => {
    const m = line.match(IMG);
    if (!m) return;
    const [, rawAlt, src] = m;

    // The caption is the next non-blank line, if it's short and not another image.
    let caption = '';
    for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
      const next = lines[j].trim();
      if (!next) continue;
      if (!next.startsWith('!') && !next.startsWith('#') && next.length <= 200) caption = next;
      break;
    }
    if (/^\*?riddle\b/i.test(caption)) caption = '';

    const file = src.split('/').pop() ?? src;
    let kind = imageKinds[file];
    if (!kind) {
      kind = guessKind(rawAlt, caption);
      console.warn(`[gallery] ${file} is not in src/data/gallery.ts; guessing "${kind}"`);
    }

    const alt = clean(rawAlt);
    const cap = clean(caption);
    const showCite =
      (kind === 'art' || kind === 'extant') && cap && !norm(alt).includes(norm(cap));

    items.push({
      src,
      alt,
      cite: file in imageCites ? imageCites[file] : showCite ? cap : null,
      kind,
      tags: entry.data.tags,
      entryTitle: entry.data.title,
      entryHref: `/ans/${entry.id}/`,
    });
  });

  return items;
}
