// Single source of truth for the tools list.
// Both /tools/ and the home page read from this, so adding a tool here
// makes it appear in both places.
//
// Brambletally is deliberately NOT in this list — it's a top-level nav
// destination of its own, not one of the utility tools.

export type Tool = {
  href: string;
  title: string;
  summary: string;
  group: 'ans' | 'general';
  /** Can save its inputs to a Brambletally account (works without one). */
  saves?: boolean;
  /** Show in the home page "Pattern generators" band. */
  featured?: boolean;
};

export const tools: Tool[] = [
  {
    href: '/tools/salvar/',
    title: 'Şalvar Pattern Generator',
    summary:
      'Enter your measurements and get a to-scale cutting diagram for Turkish pants, with every dimension marked.',
    group: 'ans',
    saves: true,
    featured: true,
  },
  {
    href: '/tools/caftan/',
    title: 'Kaftan Pattern Generator',
    summary:
      'Draft every piece of an Ottoman kaftan to scale — body panels, front and side gores, gussets, and three sleeve styles.',
    group: 'ans',
    saves: true,
    featured: true,
  },
  {
    href: '/tools/war-food-planner/',
    title: 'War Food Planner',
    summary:
      'Plan camp meals by day and slot, scaled to your party size, with a shopping list and cooler strategy.',
    group: 'general',
    saves: true,
  },
  {
    href: '/tools/award-rec/',
    title: 'Award Recommendation Helper',
    summary:
      'A guided worksheet for writing a strong award recommendation to the Crown, in your own words.',
    group: 'general',
    saves: true,
  },
  {
    href: '/tools/packing-list/',
    title: 'Event Packing List',
    summary:
      'Build a printable packing list for your whole household, by person and by activity.',
    group: 'general',
    saves: true,
  },
  {
    href: '/tools/gate-calculator/',
    title: 'Gate Calculator',
    summary:
      "Track attendance and tally fees at gate. Calculates change, logs each group's details, and summarizes your day.",
    group: 'general',
    saves: true,
  },
];

export const featuredTools = tools.filter((t) => t.featured);
