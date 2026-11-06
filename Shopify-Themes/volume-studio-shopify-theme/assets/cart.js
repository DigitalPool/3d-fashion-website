/* Cart: Shopify AJAX API + inventory drawer */
import { Sound } from './sound.js';

const SHOP = window.SHOP || {};
const R = Object.assign({ cart: '/cart.js', cart_add: '/cart/add.js', cart_change: '/cart/change.js', cart_url: '/cart' }, SHOP.routes || {});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function money(cents) {
  const fmt = SHOP.moneyFormat || '${{amount}}';
  const n = (Number(cents) || 0) / 100;
  const withDelim = (num, dec, th, ds) => {
    const parts = num.toFixed(dec).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, th);
    return parts.join(ds);
  };
  return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, (_, k) => {
    switch (k) {
      case 'amount_no_decimals': return withDelim(n, 0, ',', '.');
      case 'amount_with_comma_separator': return withDelim(n, 2, '.', ',');
      case 'amount_no_decimals_with_comma_separator': return withDelim(n, 0, '.', ',');
      case 'amount_with_apostrophe_separator': return withDelim(n, 2, "'", '.');
      default: return withDelim(n, 2, ',', '.');
    }
  }).replace(/<[^>]*>/g, '');
}

let drawer, body, sub, countEls, toastEl, toastTimer;

function img(url, w = 160) {
  if (!url) return '';
  try { const u = new URL(url, location.href); u.searchParams.set('width', w); return u.href; } catch (e) { return url; }
}

function render(cart) {
  countEls.forEach((c) => { c.textContent = cart.item_count; });
  if (!drawer) return;
  const h = drawer.querySelector('[data-cart-count]');
  if (h) h.textContent = `[${String(cart.item_count).padStart(2, '0')}]`;
  sub.textContent = money(cart.total_price);
  drawer.classList.toggle('is-empty', cart.item_count === 0);
  if (!cart.items.length) {
    body.innerHTML = `<div class="drawer__empty"><span>Your bag is empty</span><a class="btn" href="${esc(SHOP.routes?.all || '/collections/all')}" data-close-drawer>Browse the collection</a></div>`;
    return;
  }
  body.innerHTML = cart.items.map((it) => `
    <div class="line" data-key="${esc(it.key)}">
      <a href="${esc(it.url)}"><img src="${esc(img(it.image))}" alt="" loading="lazy" width="76" height="76"></a>
      <div>
        <p class="line__t"><a href="${esc(it.url)}">${esc(it.product_title)}</a></p>
        ${it.variant_title ? `<div class="line__v">${esc(it.variant_title)}</div>` : ''}
        <div class="line__q">
          <button type="button" data-q="-1" aria-label="Decrease">&minus;</button><span>${it.quantity}</span><button type="button" data-q="1" aria-label="Increase">+</button>
        </div>
      </div>
      <div class="line__p">${money(it.final_line_price)}<button type="button" class="line__rm" data-rm>Remove</button></div>
    </div>`).join('');
}

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.description || data.message || 'Request failed');
  return data;
}

export const Cart = {
  money,
  state: null,
  async fetch() { const c = await json(await fetch(R.cart, { headers: { Accept: 'application/json' } })); this.state = c; render(c); return c; },
  async add(id, quantity = 1, { open = true } = {}) {
    const items = Array.isArray(id) ? id : [{ id, quantity }];
    await json(await fetch(R.cart_add, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items }) }));
    Sound.play('coin');
    const c = await this.fetch();
    toast(items.length > 1 ? `${items.length} items added to bag` : 'Added to bag');
    if (open) this.open();
    return c;
  },
  async change(key, quantity) {
    const c = await json(await fetch(R.cart_change, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ id: key, quantity }) }));
    this.state = c; render(c); return c;
  },
  open() { if (!drawer) return; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); Sound.play('whoosh'); drawer.querySelector('.drawer__close')?.focus({ preventScroll: true }); },
  close() { if (!drawer) return; drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); Sound.play('back'); },
  init() {
    drawer = document.querySelector('[data-drawer]');
    countEls = Array.from(document.querySelectorAll('[data-cart-count-badge]'));
    toastEl = document.querySelector('[data-toast]');
    if (drawer) {
      body = drawer.querySelector('[data-drawer-body]');
      sub = drawer.querySelector('[data-subtotal]');
      drawer.addEventListener('click', async (e) => {
        if (e.target.closest('[data-close-drawer]')) { this.close(); return; }
        const line = e.target.closest('.line');
        if (!line) return;
        const key = line.dataset.key;
        const item = this.state?.items.find((i) => i.key === key);
        if (!item) return;
        if (e.target.closest('[data-rm]')) { Sound.play('back'); await this.change(key, 0); }
        const q = e.target.closest('[data-q]');
        if (q) { Sound.play('tick'); await this.change(key, Math.max(0, item.quantity + +q.dataset.q)); }
      });
      addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) this.close(); });
    }
    document.querySelectorAll('[data-open-cart]').forEach((b) => b.addEventListener('click', (e) => {
      if (!drawer) return;
      e.preventDefault(); this.open();
    }));
    this.fetch().catch(() => {});
  },
};

function toast(text) {
  if (!toastEl) return;
  toastEl.querySelector('span').textContent = text;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 1800);
}
