import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync } from 'node:fs';

// Keep SCA Life out of the sitemap until it has at least one post.
const scaLifeHasPosts = readdirSync('./src/content/sca-life').some((f) => f.endsWith('.md'));

export default defineConfig({
  site: 'https://rayhanasrepositorium.com',
  integrations: [
    sitemap({
      filter: (page) => scaLifeHasPosts || !page.includes('/sca-life/'),
      // the Ebru tray and its gallery are plain HTML in public/, which Astro doesn't list by itself
      customPages: ['https://rayhanasrepositorium.com/tools/ebru/', 'https://rayhanasrepositorium.com/tools/ebru/gallery/'],
    }),
  ],
});
