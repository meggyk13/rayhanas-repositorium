# Rayhana's Repositorium

Personal SCA site built with [Astro](https://astro.build). Static, fast, and
updatable from a phone.

## One-time setup (laptop)

1. **Push to GitHub**
   ```bash
   cd rayhanas-repositorium
   git init
   git add -A
   git commit -m "Initial site"
   ```
   Create a new repo on github.com, then follow its "push an existing
   repository" instructions.

2. **Connect Cloudflare Pages**
   - Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git
   - Pick the repo. Framework preset: **Astro**. Build command: `npm run build`.
     Output directory: `dist`. Deploy.
   - Then Custom domains → add `rayhanasrepositorium.com`. Since the domain is
     already on Cloudflare, this is automatic.

3. Done. Every commit to the main branch deploys automatically.

## Local preview (optional)

```bash
npm install
npm run dev
```

Then open http://localhost:4321

## Updating from your phone

**Add or edit content:** open the repo in the GitHub app (or github.dev in a
browser), navigate to the right folder, edit or create a `.md` file, commit.
The site rebuilds in a minute or two.

| To add a... | Create a `.md` file in... |
| --- | --- |
| A&S project or Karagöz play | `src/content/ans/` |
| Class handout | `src/content/handouts/` |
| Article | `src/content/articles/` |

Every file starts with this header:

```yaml
---
title: "The Title"
summary: "One line shown on index pages"
date: 2026-07-15
tags: [chatelaine, cooking]
pdf: /files/optional-original.pdf   # optional
---
```

Index pages, the homepage "Recently added" section, and tag filters all build
themselves from these headers. You never edit navigation or index pages.

**Images:** upload to `public/images/`, reference as
`![caption](/images/name.jpg)`.

**PDFs** (the "as judged" originals): upload to `public/files/`, link in
frontmatter with `pdf: /files/name.pdf`.

**Bigger changes** (new tools, design work): Claude Code via the Claude
mobile app can work on the repo directly and push.

## Structure

```
src/content/       ← everything you write (markdown)
src/pages/         ← page templates and the tools
src/pages/tools/   ← şalvar calculator, packing list
src/styles/        ← design tokens and all CSS
src/layouts/       ← the shared page shell (header/nav/footer)
public/images/     ← photos and figures
```

## To-do

- [ ] Replace the two `example-*.md` placeholder files with real content
- [ ] Write the About page (your voice) with a contact method
- [ ] Add handout figure images (the pattern diagram especially)
- [ ] Add launch articles after review (five-article slate)
- [ ] Update the şalvar handout once the revised proportions are fabric-tested
- [ ] Build the caftan generator and period measure converter
