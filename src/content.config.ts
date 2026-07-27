import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Shared frontmatter for every written entry:
// ---
// title: "..."
// summary: "One line shown on index pages"
// date: 2026-07-15
// tags: [ottoman, sewing]
// ---
const base = z.object({
  title: z.string(),
  summary: z.string(),
  date: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  // Optional link to the PDF "as judged" or "as taught"
  pdf: z.string().optional(),
});

// Arts & Sciences: the work itself, in three flavours.
//   project  — something I made, documented, with sources
//   handout  — the take-home version of a class I taught
//   research — period evidence and construction guides
const ans = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/ans',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: base.extend({
    kind: z.enum(['project', 'handout', 'research']).default('project'),
  }),
});

// SCA Life: newcomers, mentoring, opinion, commentary.
const scaLife = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/sca-life',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: base,
});

export const collections = { ans, 'sca-life': scaLife };
