// The gallery page collects every image from the A&S entries automatically.
// This file only says what kind of image each one is. Add a line here when you
// add an image to an entry; an image missing from this list gets a best guess
// (see guessKind in src/lib/gallery.ts) and a warning in the build log.

export type GalleryKind = 'art' | 'extant' | 'mine' | 'process';

export const kindLabels: Record<GalleryKind, string> = {
  art: 'Period art',
  extant: 'Extant',
  mine: 'My work',
  process: 'Patterns & process',
};

// Citation overrides. By default the caption under an image is shown as its
// citation; use this when the caption is commentary rather than a source.
// null hides the citation line.
export const imageCites: Record<string, string | null> = {
  'the-ottoman-caftan-2.jpg': null,
  'the-ottoman-caftan-3.jpg': null,
  'the-ottoman-caftan-6.jpg': null,
  'the-ottoman-caftan-7.jpg': 'Codex Vindobonensis, fol. 28',
};

export const imageKinds: Record<string, GalleryKind> = {
  'block-printed-sleeves-1.jpg': 'mine',
  'block-printed-sleeves-2.png': 'art',
  'block-printed-sleeves-3.jpg': 'extant',
  'block-printed-sleeves-4.png': 'extant',
  'block-printed-sleeves-5.png': 'extant',
  'block-printed-sleeves-6.png': 'extant',

  'crab-hat-1.png': 'art',
  'crab-hat-2.jpg': 'process',
  'crab-hat-3.jpg': 'process',
  'crab-hat-4.png': 'art',
  'crab-hat-5.png': 'art',
  'crab-hat-6.jpg': 'art',
  'crab-hat-7.png': 'art',
  'crab-hat-8.png': 'art',

  'gomlek-1.jpg': 'mine',
  'gomlek-2.jpg': 'mine',
  'gomlek-3.png': 'process',
  'gomlek-4.png': 'art',
  'gomlek-5.jpg': 'art',
  'gomlek-6.png': 'art',
  'gomlek-7.jpg': 'extant',
  'gomlek-8.jpg': 'art',

  'halloum-with-tatbila-1.jpg': 'mine',

  'karagoz-hacivat-play-1.jpg': 'mine',
  'karagoz-hacivat-puppets-1.jpg': 'mine',
  'karagoz-hacivat-puppets-2.jpg': 'process',
  'karagoz-hacivat-puppets-3.jpg': 'mine',
  'karagoz-hacivat-puppets-4.jpg': 'process',
  'karagoz-hacivat-puppets-5.jpg': 'process',

  'kasbasti-1.png': 'extant',
  'kasbasti-2.png': 'extant',
  'kasbasti-3.png': 'art',
  'kasbasti-4.png': 'art',
  'kasbasti-5.png': 'art',
  'kasbasti-6.jpg': 'extant',
  'kasbasti-8.png': 'extant',
  'kasbasti-9.jpg': 'extant',

  'ottoman-chatelaine-badge-1.jpg': 'mine',

  'ottoman-face-coverings-1.png': 'art',
  'ottoman-face-coverings-2.png': 'art',
  'ottoman-face-coverings-3.png': 'art',
  'ottoman-face-coverings-4.png': 'art',
  'ottoman-face-coverings-5.png': 'art',
  'ottoman-face-coverings-6.jpg': 'art',

  'pece-1.png': 'art',
  'pece-2.png': 'art',
  'pece-3.png': 'art',
  'pece-4.png': 'art',
  'pece-5.png': 'art',
  'pece-6.jpg': 'art',
  'pece-7.jpg': 'art',
  'pece-8.jpg': 'art',

  'the-ottoman-caftan-1.jpg': 'mine',
  'the-ottoman-caftan-2.jpg': 'extant',
  'the-ottoman-caftan-3.jpg': 'art',
  'the-ottoman-caftan-4.jpg': 'extant',
  'the-ottoman-caftan-5.jpg': 'extant',
  'the-ottoman-caftan-6.jpg': 'extant',
  'the-ottoman-caftan-7.jpg': 'art',
  'the-ottoman-caftan-8.jpg': 'extant',

  'turban-and-hat-adornments-1.png': 'art',
  'turban-and-hat-adornments-2.png': 'art',
  'turban-and-hat-adornments-3.png': 'art',
  'turban-and-hat-adornments-4.png': 'art',
  'turban-and-hat-adornments-5.png': 'art',
  'turban-and-hat-adornments-6.png': 'extant',
  'turban-and-hat-adornments-7.png': 'extant',
  'turban-and-hat-adornments-8.png': 'extant',

  'turkish-miniatures-1.jpg': 'art',
  'turkish-miniatures-2.jpg': 'art',
  'turkish-miniatures-3.jpg': 'art',
  'turkish-miniatures-4.jpg': 'art',
  'turkish-miniatures-5.png': 'extant',
  'turkish-miniatures-copy-1.jpg': 'mine',
  'turkish-miniatures-copy-2.jpg': 'mine',
  'turkish-miniatures-copy-3.jpg': 'mine',
  'turkish-miniatures-copy-4.jpg': 'mine',
};
