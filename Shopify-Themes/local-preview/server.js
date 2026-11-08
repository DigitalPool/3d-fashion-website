// Preview for the Shopify themes in this folder: run locally with `npm start`, or on Vercel through api/index.js.
// Renders the real theme files (nothing is copied or converted) with the fake store in
// mock-store.json, so an edit to a theme file shows up in the browser on save and the
// theme folder stays ready to zip for Shopify.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream, watch } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const THEMES = [
  { key: 'ap', name: 'AlwaysPaid x Deadly Soul', dir: 'ap-x-deadly-soul-theme-1101', port: 4101 },
  { key: 'volume', name: 'Volume Studio', dir: 'volume-studio-shopify-theme', port: 4102 },
];
const HOSTED = Boolean(process.env.VERCEL);
// Each deploy serves its assets under a new folder (/assets/v-<commit>/…), so browsers never keep an old script.
// Relative imports between the theme's scripts resolve inside the same folder, so they pick up the version too.
const ASSET_VERSION = HOSTED ? `v-${(process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || String(Date.now())).slice(0, 12)}` : '';
const MOCK_MEDIA = resolve(HERE, '../../product-mockups/png');
const MOCK_STORE = join(HERE, 'mock-store.json');
const MIME = {
  '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const ROUTES = {
  root_url: '/', all_products_collection_url: '/collections/all', collections_url: '/collections', cart_url: '/cart',
  cart_add_url: '/cart/add', cart_change_url: '/cart/change', cart_update_url: '/cart/update', cart_clear_url: '/cart/clear',
  search_url: '/search', account_url: '/account', account_login_url: '/account/login',
};

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/^\s*\/\*[\s\S]*?\*\//, ''));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cents = (price) => (price == null ? null : Math.round(parseFloat(price) * 100));

/* ---------- mock store ---------- */
function imageObject(src, id, alt) {
  return { id, src, alt: alt || '', media_type: 'image', width: 1200, height: 1500, aspect_ratio: 0.8 };
}

function loadStore() {
  const raw = readJson(MOCK_STORE);
  let nextId = 1000;
  const products = raw.products.map((p) => {
    const images = (p.images || []).map((src) => imageObject(src, ++nextId, p.title));
    const single = p.variants.length === 1 && p.variants[0].title === 'Default Title';
    const productId = ++nextId;
    const optionNames = p.option_names || [p.option_name];
    const variants = p.variants.map((v) => {
      const image = images.find((i) => i.src === v.image) || null;
      const values = v.options || [v.title];
      return {
        id: ++nextId, title: values.join(' / '), option1: values[0], option2: values[1] ?? null, option3: values[2] ?? null, options: values,
        price: cents(v.price), compare_at_price: cents(v.compare_at_price), available: v.available !== false, sku: v.sku,
        featured_image: image, featured_media: image, image, url: `/products/${p.handle}`,
      };
    });
    const first = variants.find((v) => v.available) || variants[0];
    const compare = Math.max(0, ...variants.map((v) => v.compare_at_price || 0));
    return {
      // The theme already shows its bundled studio shot, so leave that out of the media list to avoid a duplicate thumbnail.
      ...p, id: productId, object_type: 'product', url: `/products/${p.handle}`, images, media: images.filter((i) => !i.src.startsWith('/assets/mockup-')),
      featured_image: images[0] || null, featured_media: images[0] || null, variants,
      options: optionNames, price: Math.min(...variants.map((v) => v.price)), compare_at_price: compare || null,
      available: variants.some((v) => v.available), has_only_default_variant: single,
      selected_or_first_available_variant: first,
      options_with_values: optionNames.map((name, i) => ({ name, position: i + 1, selected_value: first.options[i], values: [...new Set(variants.map((v) => v.options[i]))] })),
      collections: [],
    };
  });
  const makeCollection = (handle, title, description, items) => ({
    id: ++nextId, handle, title, description, url: `/collections/${handle}`, products: items,
    products_count: items.length, all_products_count: items.length, featured_image: items[0]?.featured_image || null,
  });
  const list = raw.collections.map((c) => makeCollection(c.handle, c.title, c.description, products.filter((p) => p.collection === c.handle)));
  list.forEach((c) => c.products.forEach((p) => p.collections.push(c)));
  // `collections` loops like a list and also looks up by handle, as it does on Shopify.
  const collections = [...list];
  list.forEach((c) => { collections[c.handle] = c; });
  collections.all = makeCollection('all', 'All products', '', products);
  const blog = {
    ...raw.blog, url: `/blogs/${raw.blog.handle}`,
    articles: raw.blog.articles.map((a) => ({
      ...a, url: `/blogs/${raw.blog.handle}/${a.handle}`, image: a.image ? imageObject(a.image, ++nextId, a.title) : null,
    })),
  };
  const pages = raw.pages.map((p) => ({ ...p, url: `/pages/${p.handle}` }));
  return { shop: { ...raw.shop, policies: raw.policies }, products, collections, pages, blog };
}

/* ---------- one preview site per theme ---------- */
export function createTheme(theme) {
  const root = resolve(HERE, '..', theme.dir);
  const file = (...parts) => join(root, ...parts);
  let store = loadStore();
  // Each visitor's cart lives in their own cookie, as [{ variantId, quantity }].
  const cartCookie = `preview_cart_${theme.key}`;
  const session = new AsyncLocalStorage();
  const lines = () => session.getStore().lines;
  const setLines = (next) => { session.getStore().lines = next; };
  function readCart(req) {
    const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${cartCookie}=`));
    try {
      const parsed = JSON.parse(decodeURIComponent(raw.slice(cartCookie.length + 1)));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const saveCart = (res) => {
    res.setHeader('Set-Cookie', `${cartCookie}=${encodeURIComponent(JSON.stringify(lines()))}; Path=/; Max-Age=604800; SameSite=Lax`);
  };
  const listeners = new Set();

  /* ---- settings: saved value, else the schema default, with pickers resolved to objects ---- */
  const asImage = (v) => (v ? (typeof v === 'string' ? imageObject(v, 1, '') : v) : undefined);
  function resolveSetting(def, value) {
    const v = value === undefined ? def.default : value;
    const byHandle = (list, h) => list.find((x) => x.handle === h);
    switch (def.type) {
      case 'collection': return v ? (v === 'all' ? store.collections.all : store.collections[v]) : undefined;
      case 'product': return v ? byHandle(store.products, v) : undefined;
      case 'product_list': return (v || []).map((h) => byHandle(store.products, h)).filter(Boolean);
      case 'collection_list': return (v || []).map((h) => store.collections[h]).filter(Boolean);
      case 'image_picker': return asImage(v);
      case 'link_list': return undefined;
      default: return v;
    }
  }
  function resolveSettings(defs, values = {}) {
    const out = {};
    for (const def of defs || []) {
      if (def.id) out[def.id] = resolveSetting(def, values[def.id]);
    }
    return out;
  }
  function globalSettings() {
    const schema = readJson(file('config/settings_schema.json'));
    const data = readJson(file('config/settings_data.json'));
    const saved = typeof data.current === 'string' ? data.presets?.[data.current] : data.current;
    return resolveSettings(schema.flatMap((group) => group.settings || []), saved || {});
  }

  /* ---- Liquid engine with Shopify's extra tags and filters ---- */
  const engine = new Liquid({ root: file('snippets'), extname: '.liquid', cache: false, jekyllInclude: false });
  const moneyText = (value) => {
    const n = (Number(value) || 0) / 100;
    const amount = n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return store.shop.money_format.replace(/\{\{\s*\w+\s*\}\}/, amount);
  };
  const attrs = (pairs) => pairs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  engine.registerFilter('json', (v) => (v === undefined ? 'null' : JSON.stringify(v)));
  engine.registerFilter('asset_url', (name) => (ASSET_VERSION ? `/assets/${ASSET_VERSION}/${name}` : `/assets/${name}`));
  engine.registerFilter('image_url', (img) => (typeof img === 'string' ? img : img?.src || '')); // local files are not resized
  engine.registerFilter('image_tag', (url, ...args) => {
    const pairs = args.filter(Array.isArray).filter(([k]) => k !== 'widths');
    if (!pairs.some(([k]) => k === 'alt')) pairs.push(['alt', '']);
    return `<img src="${esc(url)}"${attrs(pairs)}>`;
  });
  engine.registerFilter('stylesheet_tag', (url) => `<link rel="stylesheet" href="${esc(url)}" media="all">`);
  engine.registerFilter('money', moneyText);
  engine.registerFilter('money_without_trailing_zeros', (v) => moneyText(v).replace(/\.00$/, ''));
  engine.registerFilter('placeholder_svg_tag', () => '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="100" height="100" fill="#222"/></svg>');
  engine.registerFilter('default_pagination', () => '');
  engine.registerFilter('format_code', (v) => String(v).replace(/(.{4})(?=.)/g, '$1 '));

  const blockTag = (name, open) => ({
    parse(token, remaining) {
      this.args = token.args;
      this.templates = [];
      const stream = this.liquid.parser.parseStream(remaining);
      stream.on(`tag:end${name}`, () => stream.stop())
        .on('template', (t) => this.templates.push(t))
        .on('end', () => { throw new Error(`{% ${name} %} is not closed`); });
      stream.start();
    },
    * render(ctx, emitter) { yield* open.call(this, ctx, emitter); },
  });
  engine.registerTag('form', blockTag('form', function* (ctx, emitter) {
    const type = (this.args.match(/^\s*['"]([\w-]+)['"]/) || [])[1];
    const options = [...this.args.matchAll(/(\w+):\s*'([^']*)'/g)].map((m) => [m[1], m[2]]);
    const action = { product: '/cart/add', customer: '/contact#contact', storefront_password: '/password' }[type] || '/contact';
    const posted = ctx.globals.request.query.get('customer_posted') === 'true';
    ctx.push({ form: { 'posted_successfully?': posted, errors: null } });
    emitter.write(`<form method="post" action="${action}"${attrs(options)}>`);
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    emitter.write('</form>');
    ctx.pop();
  }));
  engine.registerTag('paginate', blockTag('paginate', function* (ctx, emitter) {
    ctx.push({ paginate: { pages: 1, current_page: 1 } }); // the mock catalogue never fills more than one page
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    ctx.pop();
  }));
  engine.registerTag('layout', { parse() {}, render() {} });
  engine.registerTag('sections', {
    parse(token) { this.group = (token.args.match(/['"]([\w-]+)['"]/) || [])[1]; },
    * render(ctx, emitter) {
      const group = readJson(file('sections', `${this.group}.json`));
      emitter.write(yield renderSections(group, ctx.globals, `sections--local__${this.group}`, this.group));
    },
  });

  const SCHEMA = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;
  async function renderSection(id, config, globals, group) {
    const source = readFileSync(file('sections', `${config.type}.liquid`), 'utf8');
    const schemaText = source.match(SCHEMA)?.[1];
    const schema = schemaText ? JSON.parse(schemaText) : {};
    const blockDefs = schema.blocks || [];
    const blockIds = config.block_order || Object.keys(config.blocks || {});
    const section = {
      id,
      settings: resolveSettings(schema.settings, config.settings),
      blocks: blockIds.map((bid) => {
        const block = config.blocks[bid];
        const def = blockDefs.find((b) => b.type === block.type);
        return { id: bid, type: block.type, settings: resolveSettings(def?.settings, block.settings), shopify_attributes: '' };
      }),
    };
    const html = await engine.parseAndRender(source.replace(SCHEMA, ''), { section }, { globals });
    const classes = ['shopify-section', group && `shopify-section-group-${group}`, schema.class].filter(Boolean).join(' ');
    const tag = schema.tag || 'div';
    return `<${tag} id="shopify-section-${id}" class="${classes}">${html}</${tag}>`;
  }
  async function renderSections(config, globals, prefix, group) {
    const parts = [];
    for (const key of config.order) {
      try {
        parts.push(await renderSection(`${prefix}__${key}`, config.sections[key], globals, group));
      } catch (error) {
        console.error(`[${theme.name}] section "${key}":`, error.message);
        parts.push(`<pre style="background:#300;color:#fff;padding:16px;white-space:pre-wrap;position:relative;z-index:9">Liquid error in section "${esc(key)}":\n${esc(error.message)}</pre>`);
      }
    }
    return parts.join('\n');
  }

  /* ---- cart ---- */
  const findVariant = (id) => {
    for (const product of store.products) {
      const variant = product.variants.find((v) => v.id === Number(id));
      if (variant) return { product, variant };
    }
    return null;
  };
  function cartObject() {
    const items = [];
    for (const line of lines()) {
      const hit = findVariant(line.variantId);
      if (!hit) continue;
      const { product, variant } = hit;
      const image = variant.image || product.featured_image;
      const index = items.length + 1;
      items.push({
        id: variant.id, key: `${variant.id}:local`, variant_id: variant.id, product_id: product.id, handle: product.handle,
        title: product.has_only_default_variant ? product.title : `${product.title} - ${variant.title}`,
        product_title: product.title, variant_title: product.has_only_default_variant ? null : variant.title,
        url: `${product.url}?variant=${variant.id}`, image, product, variant, quantity: line.quantity,
        price: variant.price, line_price: variant.price * line.quantity, final_price: variant.price,
        final_line_price: variant.price * line.quantity, url_to_remove: `/cart/change?line=${index}&quantity=0`,
      });
    }
    return {
      items, item_count: items.reduce((n, i) => n + i.quantity, 0), total_price: items.reduce((n, i) => n + i.final_line_price, 0),
      currency: store.shop.currency, note: null, attributes: {},
    };
  }
  const cartJson = () => {
    const cart = cartObject();
    return {
      token: 'local-preview', note: null, attributes: {}, currency: cart.currency, requires_shipping: cart.item_count > 0,
      item_count: cart.item_count, total_price: cart.total_price, original_total_price: cart.total_price, items_subtotal_price: cart.total_price,
      items: cart.items.map(({ product, variant, image, url_to_remove, ...item }) => ({ ...item, image: image?.src || null })),
    };
  };
  function addToCart(id, quantity = 1) {
    if (!findVariant(id)) return false;
    const line = lines().find((l) => l.variantId === Number(id));
    if (line) line.quantity += Number(quantity) || 1;
    else lines().push({ variantId: Number(id), quantity: Number(quantity) || 1 });
    return true;
  }
  function changeCart({ id, line, quantity }) {
    const current = lines();
    const index = line ? Number(line) - 1 : current.findIndex((l) => `${l.variantId}:local` === String(id) || l.variantId === Number(id));
    if (index < 0 || !current[index]) return false;
    if (Number(quantity) > 0) current[index].quantity = Number(quantity);
    else current.splice(index, 1);
    return true;
  }

  /* ---- page rendering ---- */
  const devScript = `<script>(()=>{const s=new EventSource('/__dev/events');s.onmessage=(e)=>{
    if(e.data.endsWith('.css')){document.querySelectorAll('link[rel=stylesheet][href*="/assets/"]').forEach((l)=>{const u=new URL(l.href);u.searchParams.set('t',Date.now());l.href=u.href;});}
    else location.reload();};})();</script>`;

  async function renderTemplate(templateName, url, extra = {}) {
    const [name, suffix] = templateName.split('.');
    const q = url.searchParams;
    const globals = {
      ...store, settings: globalSettings(), routes: ROUTES, cart: cartObject(), powered_by_link: 'Powered by Shopify',
      shop: { ...store.shop, url: url.origin }, linklists: {}, current_page: 1, current_tags: null,
      canonical_url: url.origin + url.pathname, page_description: store.shop.description, page_title: store.shop.name,
      request: { locale: { iso_code: 'en' }, path: url.pathname, origin: url.origin, page_type: name, query: q },
      template: { name, suffix: suffix || null, directory: null }, content_for_header: HOSTED ? '' : devScript, ...extra,
    };
    const jsonPath = file('templates', `${templateName}.json`);
    if (!existsSync(jsonPath)) {
      const source = readFileSync(file('templates', `${templateName}.liquid`), 'utf8');
      return engine.parseAndRender(source, {}, { globals }); // gift_card uses {% layout none %}
    }
    const config = readJson(jsonPath);
    const content = await renderSections(config, globals, 'template--local', null);
    const layout = readFileSync(file('layout', `${config.layout || 'theme'}.liquid`), 'utf8');
    return engine.parseAndRender(layout, { content_for_layout: content }, { globals });
  }

  function indexPage() {
    const groups = {
      Main: ['/', ...store.pages.map((p) => p.url), '/collections', '/collections/all', ...store.collections.map((c) => c.url)],
      Products: store.products.map((p) => p.url),
      Shopping: ['/cart', '/search', '/search?q=tee'],
      Other: [store.blog.url, store.blog.articles[0].url, '/password', '/gift_card', '/this-page-does-not-exist'],
    };
    const body = Object.entries(groups).map(([title, links]) => `<h2>${title}</h2><ul>${links.map((l) => `<li><a href="${l}">${l}</a></li>`).join('')}</ul>`).join('');
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(theme.name)} preview pages</title>
      <style>body{font:16px/1.5 system-ui;background:#111;color:#eee;max-width:720px;margin:40px auto;padding:0 16px}a{color:#8cf}h2{margin-top:28px;font-size:18px}</style>
      <h1>${esc(theme.name)}: every page</h1>${body}`;
  }
  const notice = (title, text) => `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:16px/1.5 system-ui;background:#111;color:#eee;max-width:640px;margin:80px auto;padding:0 16px}a{color:#8cf}</style><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a href="/">Back to the store</a></p>`;

  /* ---- request handling ---- */
  const readBody = (req) => new Promise((done, fail) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c)).on('end', () => done(Buffer.concat(chunks).toString())).on('error', fail);
  });
  function parseBody(req, text) {
    if ((req.headers['content-type'] || '').includes('json')) return text ? JSON.parse(text) : {};
    const params = new URLSearchParams(text);
    return { ...Object.fromEntries(params), updates: params.getAll('updates[]') };
  }
  const send = (res, status, type, body) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  const html = (res, body, status = 200) => send(res, status, 'text/html; charset=utf-8', body);
  const json = (res, data, status = 200) => send(res, status, 'application/json', JSON.stringify(data));
  const redirect = (res, to) => { res.writeHead(303, { Location: to }); res.end(); };

  function serveFile(res, base, relative) {
    const versioned = Boolean(ASSET_VERSION) && relative.startsWith(`/${ASSET_VERSION}/`);
    if (versioned) relative = relative.slice(ASSET_VERSION.length + 1);
    const target = resolve(base, `.${decodeURIComponent(relative)}`);
    if (!target.startsWith(base + sep) || !existsSync(target) || !statSync(target).isFile()) return send(res, 404, 'text/plain', 'Not found');
    // Versioned files never change, so they can be kept; anything else is checked with the server on every load.
    const cache = !HOSTED ? 'no-store' : versioned ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache });
    createReadStream(target).pipe(res);
  }

  async function handle(req, res) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = new URL(req.url, `${protocol}://${req.headers.host || `localhost:${theme.port}`}`);
    const path = url.pathname.replace(/(.)\/$/, '$1');
    const post = req.method === 'POST';

    if (path === '/__dev/events' && !HOSTED) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      listeners.add(res);
      req.on('close', () => listeners.delete(res));
      return;
    }
    if (path === '/__pages') return html(res, indexPage());
    if (path === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (path.startsWith('/assets/')) return serveFile(res, file('assets'), path.slice('/assets'.length));
    if (path.startsWith('/mock-media/')) return serveFile(res, MOCK_MEDIA, path.slice('/mock-media'.length));

    // Shopify's Ajax cart API, plus the plain form versions
    if (path === '/cart.js') return json(res, cartJson());
    if (path === '/cart/add.js' || path === '/cart/add') {
      const body = parseBody(req, await readBody(req));
      const items = body.items || [{ id: body.id, quantity: body.quantity }];
      const ok = items.every((i) => findVariant(i.id));
      if (!ok) return json(res, { status: 404, message: 'Cart Error', description: 'Cannot find variant' }, 404);
      items.forEach((i) => addToCart(i.id, i.quantity));
      saveCart(res);
      return path.endsWith('.js') ? json(res, { items: cartJson().items }) : redirect(res, '/cart');
    }
    if (path === '/cart/change.js' || path === '/cart/change') {
      const body = post ? parseBody(req, await readBody(req)) : Object.fromEntries(url.searchParams);
      const ok = changeCart(body);
      saveCart(res);
      if (path.endsWith('.js')) return ok ? json(res, cartJson()) : json(res, { status: 400, message: 'Cart Error', description: 'No such line' }, 400);
      return redirect(res, '/cart');
    }
    if (path === '/cart/clear.js') { setLines([]); saveCart(res); return json(res, cartJson()); }
    if (path === '/cart' && post) {
      const body = parseBody(req, await readBody(req));
      if (body.updates?.length) {
        setLines(lines().map((line, i) => ({ ...line, quantity: Number(body.updates[i] ?? line.quantity) })).filter((l) => l.quantity > 0));
        saveCart(res);
      }
      if ('checkout' in body) return html(res, notice('Checkout goes here', 'On the live store this button hands over to Shopify\'s own checkout, which cannot run locally. Your cart and the button itself are working.'));
      return redirect(res, '/cart');
    }
    if (post && path === '/contact') {
      await readBody(req);
      return redirect(res, `${req.headers.referer ? new URL(req.headers.referer).pathname : '/'}?customer_posted=true#contact`);
    }
    if (post && path === '/password') { await readBody(req); return redirect(res, '/'); }

    // Storefront pages
    const seg = path.split('/').filter(Boolean);
    const page = async (template, extra, status = 200) => html(res, await renderTemplate(template, url, extra), status);
    if (path === '/') return page('index');
    if (path === '/cart') return page('cart', { page_title: 'Cart' });
    if (path === '/password') return page('password');
    if (path === '/collections') return page('list-collections', { page_title: 'Collections' });
    if (path === '/gift_card') {
      return page('gift_card', { gift_card: { initial_value: 5000, balance: 5000, code: 'LOCALPREVIEW1234' } });
    }
    if (path === '/search') {
      const terms = (url.searchParams.get('q') || '').trim();
      const needle = terms.toLowerCase();
      const results = terms ? store.products.filter((p) => [p.title, p.type, p.vendor, ...p.tags].join(' ').toLowerCase().includes(needle)) : [];
      return page('search', { page_title: 'Search', search: { performed: Boolean(terms), terms, results, results_count: results.length } });
    }
    if (seg[0] === 'collections' && seg.length === 2) {
      const collection = seg[1] === 'all' ? store.collections.all : store.collections[seg[1]];
      if (collection) return page('collection', { collection, page_title: collection.title });
    }
    const productHandle = seg[0] === 'products' && seg.length === 2 ? seg[1]
      : seg[0] === 'collections' && seg[2] === 'products' ? seg[3] : null;
    if (productHandle) {
      const found = store.products.find((p) => p.handle === productHandle);
      if (found) {
        const chosen = found.variants.find((v) => v.id === Number(url.searchParams.get('variant'))) || found.selected_or_first_available_variant;
        const product = {
          ...found, selected_or_first_available_variant: chosen,
          options_with_values: found.options_with_values.map((o, i) => ({ ...o, selected_value: chosen.options[i] })),
        };
        return page('product', { product, page_title: found.title, page_description: found.description.replace(/<[^>]+>/g, ''), page_image: found.featured_image });
      }
    }
    if (seg[0] === 'pages' && seg.length === 2) {
      const found = store.pages.find((p) => p.handle === seg[1]);
      if (found) return page(found.template_suffix ? `page.${found.template_suffix}` : 'page', { page: found, page_title: found.title });
    }
    if (seg[0] === 'blogs' && seg[1] === store.blog.handle) {
      if (seg.length === 2) return page('blog', { blog: store.blog, page_title: store.blog.title });
      const article = store.blog.articles.find((a) => a.handle === seg[2]);
      if (article) return page('article', { blog: store.blog, article, page_title: article.title });
    }
    if (seg[0] === 'policies') return html(res, notice('Policy page', 'Shopify generates policy pages from your store admin, so they are not part of the theme.'));
    return page('404', { page_title: '404 Not Found' }, 404);
  }

  const handler = (req, res) => session.run({ lines: readCart(req) }, () => handle(req, res)).catch((error) => {
    console.error(`[${theme.name}] ${req.url}:`, error);
    if (!res.headersSent) html(res, `<pre style="padding:24px;white-space:pre-wrap">${esc(HOSTED ? 'Something went wrong.' : error.stack || error)}</pre>`, 500);
  });

  /* ---- local only: fixed port and live reload ---- */
  function startLocal() {
    createServer(handler).listen(theme.port, '127.0.0.1', () => {
      console.log(`${theme.name.padEnd(20)} http://localhost:${theme.port}   (all pages: /__pages)`);
    });
    let timer;
    const changed = (name) => {
      clearTimeout(timer);
      timer = setTimeout(() => { listeners.forEach((res) => res.write(`data: ${name}\n\n`)); }, 80);
    };
    watch(root, { recursive: true }, (_, name) => { if (name && !name.endsWith('.DS_Store')) changed(name); });
    watch(MOCK_STORE, () => {
      try { store = loadStore(); changed('mock-store.json'); }
      catch (error) { console.error('mock-store.json has an error:', error.message); }
    });
  }
  return { handler, startLocal };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  THEMES.forEach((theme) => createTheme(theme).startLocal());
}
