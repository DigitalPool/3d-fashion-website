/* Maps Shopify products to Fit Lab slots.
   Priority: product tags (fit-tee, fit-belt, fit-color:black ...) > known handles > title keywords. */

export const TYPES = {
  tee: { slot: 'top', label: 'Tee' },
  hoodie: { slot: 'top', label: 'Hoodie' },
  set: { slot: 'top', label: 'Set', covers: ['bottom'] },
  pants: { slot: 'bottom', label: 'Pants' },
  balaclava: { slot: 'head', label: 'Balaclava' },
  belt: { slot: 'waist', label: 'Belt' },
  bag_bowling: { slot: 'bag', label: 'Bag' },
  bag_messenger: { slot: 'bag', label: 'Bag' },
};
export const SLOTS = [
  { id: 'head', label: 'Head' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'waist', label: 'Waist' },
  { id: 'bag', label: 'Carry' },
];

const BY_HANDLE = {
  'where-is-my-money-tee': { type: 'tee', color: 'black' },
  'mugshot-tee': { type: 'tee', color: 'white' },
  'ap-knit-balaclava': { type: 'balaclava' },
  'apsht-cropped-set': { type: 'set', color: 'black' },
  'ap-belt': { type: 'belt' },
  'butterfly-bowling-bag': { type: 'bag_bowling', color: 'pink' },
  'soul-messenger-bag': { type: 'bag_messenger', color: 'black' },
  'apsht-windbreaker-set': { type: 'set', color: 'black' },
  'apsht-hoodie-tracksuit': { type: 'set', color: 'black' },
};

const NAMED = {
  black: '#121214', white: '#ecebe7', red: '#c3111f', blue: '#1d3db8', navy: '#1b2340', brown: '#6f3a1b', tan: '#a87a4f',
  gray: '#6c6c72', grey: '#6c6c72', charcoal: '#2f2f34', green: '#1d5a33', olive: '#4d5530', pink: '#f28ab4', 'baby pink': '#f6b8cf',
  cream: '#e6dac2', beige: '#d6c3a1', ivory: '#efe8d8', purple: '#5b2a86', lilac: '#b9a2dc', yellow: '#e8c22a', orange: '#e2611b',
  burgundy: '#5e1222', maroon: '#5e1222', silver: '#c9cbd0', gold: '#c8a24a', camo: '#4b5233',
};
export function colorHex(name, fallback = '#121214') {
  if (!name) return fallback;
  const n = String(name).trim().toLowerCase();
  if (n.startsWith('#')) return n;
  if (NAMED[n]) return NAMED[n];
  const hit = Object.keys(NAMED).find((k) => n.includes(k));
  return hit ? NAMED[hit] : fallback;
}

export function fitInfo(p) {
  if (!p) return null;
  const tags = (p.tags || []).map((t) => String(t).toLowerCase().trim());
  let type = null, color = null;
  for (const t of tags) {
    const m = t.match(/^fit[-:]([a-z_-]+)$/);
    if (m && !m[1].startsWith('color')) { const k = m[1].replace('-', '_'); if (TYPES[k]) type = k; }
    const c = t.match(/^fit[-:]colou?r[:=-](.+)$/);
    if (c) color = c[1];
  }
  const known = BY_HANDLE[p.handle];
  if (!type && known) type = known.type;
  if (!color && known) color = known.color || null;
  if (!type) {
    const t = (p.title + ' ' + (p.type || '')).toLowerCase();
    if (/balaclava|ski mask/.test(t)) type = 'balaclava';
    else if (/\bset\b|tracksuit/.test(t)) type = 'set';
    else if (/hoodie|sweatshirt/.test(t)) type = 'hoodie';
    else if (/tee\b|t-shirt|tshirt|shirt/.test(t)) type = 'tee';
    else if (/pants|jogger|sweatpant|trouser|jeans|cargo/.test(t)) type = 'pants';
    else if (/belt/.test(t)) type = 'belt';
    else if (/bowling|handbag|purse|tote/.test(t)) type = 'bag_bowling';
    else if (/messenger|crossbody|shoulder bag|sling|\bbag\b/.test(t)) type = 'bag_messenger';
  }
  if (!type) return null;
  const colorIdx = (p.options || []).findIndex((o) => /colou?r|shade|finish/i.test(o));
  return { type, slot: TYPES[type].slot, baseColor: color, colorIdx };
}

/* Colour choices for a product (variant values of its colour option) */
export function colorChoices(p) {
  const info = fitInfo(p);
  if (!info || info.colorIdx < 0) return [];
  const seen = new Map();
  for (const v of p.variants) {
    const name = (v.options && v.options[info.colorIdx]) || v.title;
    if (!seen.has(name)) seen.set(name, { name, hex: colorHex(name), available: v.available });
    else if (v.available) seen.get(name).available = true;
  }
  return Array.from(seen.values());
}
