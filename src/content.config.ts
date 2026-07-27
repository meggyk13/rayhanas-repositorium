import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Shared frontmatter shape for all written content.
// Every markdown file starts with:
// ---
// title: "..."
// summary: "One line shown on index pages"
// date: 2026-07-15
// tags: [chatelaine, cooking]
// ---
const entry = z.object({
  title: z.string(),
  summary: z.string(),
  date: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  // Optional link to the PDF "as judged" or "as taught"
  pdf: z.string().optional(),
});

const ans = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/ans' }),
  schema: entry,
});

const handouts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/handouts' }),
  schema: entry,
});

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: entry,
});

export const collections = { ans, handouts, articles };
