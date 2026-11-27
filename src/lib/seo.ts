// Structured data (schema.org JSON-LD) shared across pages.
// Base.astro always emits the WebSite node; pages add their own nodes.

export const SITE = 'https://rayhanasrepositorium.com';

const abs = (path: string) => new URL(path, SITE).href;

export const person = {
  '@type': 'Person',
  '@id': abs('/about/#rayhana'),
  name: 'Rayhana bint Estafanos al-Abbas',
  url: abs('/about/'),
  image: abs('/images/rayhana-portrait.jpg'),
  email: 'mailto:rayhana@rayhanasrepositorium.com',
  memberOf: {
    '@type': 'Organization',
    name: 'Society for Creative Anachronism',
    url: 'https://www.sca.org/',
  },
};

export const website = {
  '@type': 'WebSite',
  '@id': abs('/#website'),
  name: "Rayhana's Repositorium",
  url: abs('/'),
  author: { '@id': person['@id'] },
};

export function articleSchema(opts: {
  path: string;
  title: string;
  description: string;
  published: Date;
  image?: string | null;
  section?: string;
}) {
  return {
    '@type': 'Article',
    '@id': abs(opts.path) + '#article',
    headline: opts.title,
    description: opts.description,
    datePublished: opts.published.toISOString(),
    url: abs(opts.path),
    mainEntityOfPage: abs(opts.path),
    ...(opts.image ? { image: abs(opts.image) } : {}),
    ...(opts.section ? { articleSection: opts.section } : {}),
    author: { '@id': person['@id'] },
    isPartOf: { '@id': website['@id'] },
  };
}
