/* AP x DEADLY SOUL | core runtime (cursor, sound, cart, transitions, page modules) */
import { Sound } from './sound.js';
import { Cart } from './cart.js';

const SHOP = window.SHOP || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) document.documentElement.classList.add('reduce-motion');
document.documentElement.classList.remove('no-js');

const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
  sget(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } },
  sset(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) {} },
};
window.APDS = { $, $$, store, reduce, Sound, Cart };

/* ---------------- sound toggle ---------------- */
function initSound() {
  const saved = store.get('apds-sound');
  Sound.enabled = saved === null ? !!SHOP.sound : saved === '1';
  $$('[data-sound-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(Sound.enabled));
    b.addEventListener('click', () => {
      Sound.enabled = !Sound.enabled;
      store.set('apds-sound', Sound.enabled ? '1' : '0');
      $$('[data-sound-toggle]').forEach((x) => x.setAttribute('aria-pressed', String(Sound.enabled)));
      if (Sound.enabled) Sound.play('select');
    });
  });
  // UI blips on hover for interactive game elements
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-blip], .hud__link, .btn, .chip, .menu__item button, .card');
    if (t && !t.contains(e.relatedTarget)) Sound.play('hover');
  });
}

/* ---------------- cursor ---------------- */
function initCursor() {
  if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches || reduce) return;
  const c = $('.cursor');
  if (!c) return;
  document.body.classList.add('has-cursor');
  const label = $('.cursor__label', c);
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
  const loop = () => {
    cx += (x - cx) * 0.22; cy += (y - cy) * 0.22;
    c.style.transform = `translate3d(${cx}px,${cy}px,0)`;
    requestAnimationFrame(loop);
  };
  loop();
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('a,button,[data-cursor],input,select,label');
    c.classList.toggle('is-hover', !!t);
    label.textContent = t && t.dataset.cursor ? t.dataset.cursor : '';
  });
}

/* ---------------- page transitions ---------------- */
function initTransitions() {
  const wipe = $('.wipe');
  if (!wipe || reduce) return;
  for (let k = 0; k < 8; k++) { const i = document.createElement('i'); i.style.setProperty('--i', k); wipe.appendChild(i); }
  // reveal on load
  wipe.classList.add('is-in');
  requestAnimationFrame(() => requestAnimationFrame(() => { wipe.classList.remove('is-in'); wipe.classList.add('is-out'); }));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download') || a.dataset.noWipe !== undefined) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.hash && url.pathname === location.pathname) return;
    if (/\/(checkout|cart\/|account|apps\/)/.test(url.pathname)) return;
    e.preventDefault();
    window.APDS.go(url.href);
  });
  window.APDS.go = (href) => {
    Sound.play('select');
    wipe.classList.remove('is-out');
    wipe.classList.add('is-in');
    setTimeout(() => { location.href = href; }, 420);
  };
  addEventListener('pageshow', (e) => { if (e.persisted) { wipe.classList.remove('is-in'); wipe.classList.add('is-out'); } });
}
window.APDS.go = (href) => { location.href = href; };

/* ---------------- mobile nav ---------------- */
function initNav() {
  const m = $('[data-mnav]');
  if (!m) return;
  $$('[data-mnav-open]').forEach((b) => b.addEventListener('click', () => { m.classList.add('is-open'); b.setAttribute('aria-expanded', 'true'); }));
  $$('[data-mnav-close]').forEach((b) => b.addEventListener('click', () => { m.classList.remove('is-open'); }));
}

/* ---------------- card tilt (inventory) ---------------- */
export function tiltCards(root = document) {
  if (reduce || !window.matchMedia('(hover:hover)').matches) return;
  $$('.card', root).forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.transform = `perspective(900px) rotateY(${(px - 0.5) * 10}deg) rotateX(${(0.5 - py) * 10}deg)`;
      card.style.setProperty('--mx', px * 100 + '%');
      card.style.setProperty('--my', py * 100 + '%');
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}
window.APDS.tiltCards = tiltCards;

/* ---------------- scroll reveals ---------------- */
function initReveals() {
  const els = $$('.reveal');
  if (!els.length) return;
  if (reduce || !('IntersectionObserver' in window)) { els.forEach((e) => (e.style.opacity = 1)); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      el.animate([{ opacity: 0, transform: 'translateY(30px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 900, easing: 'cubic-bezier(.2,.8,.1,1)', fill: 'forwards', delay: (+el.dataset.delay || 0) });
      io.unobserve(el);
    });
  }, { threshold: 0.15 });
  els.forEach((e) => io.observe(e));
}

/* ---------------- product form (PDP + any [data-product-form]) ---------------- */
function initProductForms() {
  $$('[data-product-form]').forEach((root) => {
    const data = JSON.parse($('script[type="application/json"]', root).textContent);
    const state = data.variants.find((v) => v.id === data.selected) || data.variants[0];
    let current = state;
    const opts = data.options.map((_, i) => current[`option${i + 1}`]);
    const addBtn = $('[data-add]', root);
    const priceEl = $('[data-price]', root);
    const msg = $('[data-msg]', root);
    const qtyInput = $('[data-qty]', root);
    const sync = () => {
      current = data.variants.find((v) => opts.every((o, i) => v[`option${i + 1}`] === o)) || null;
      $$('[data-opt]', root).forEach((b) => {
        const idx = +b.dataset.idx;
        b.setAttribute('aria-pressed', String(opts[idx] === b.dataset.value));
        const test = opts.slice(); test[idx] = b.dataset.value;
        const v = data.variants.find((vv) => test.every((o, i) => vv[`option${i + 1}`] === o));
        b.classList.toggle('is-soldout', !v || !v.available);
      });
      if (!current) { addBtn.disabled = true; addBtn.textContent = 'Unavailable'; return; }
      priceEl.innerHTML = Cart.money(current.price) + (current.compare_at_price > current.price ? `<s>${Cart.money(current.compare_at_price)}</s>` : '');
      addBtn.disabled = !current.available;
      addBtn.textContent = current.available ? addBtn.dataset.label : 'Sold out';
      if (current.featured_image && window.APDS.pdpShow) window.APDS.pdpShow(current.featured_image);
      const u = new URL(location.href); u.searchParams.set('variant', current.id); history.replaceState(null, '', u);
      document.dispatchEvent(new CustomEvent('pdp:variant', { detail: current }));
    };
    $$('[data-opt]', root).forEach((b) => b.addEventListener('click', () => { opts[+b.dataset.idx] = b.dataset.value; Sound.play('tick'); sync(); }));
    $$('[data-qty-step]', root).forEach((b) => b.addEventListener('click', () => { qtyInput.value = Math.max(1, (+qtyInput.value || 1) + +b.dataset.qtyStep); }));
    addBtn.addEventListener('click', async () => {
      if (!current) return;
      addBtn.classList.add('is-loading');
      try { await Cart.add(current.id, +qtyInput.value || 1); msg.textContent = ''; }
      catch (err) { msg.textContent = err.message || 'Could not add'; Sound.play('error'); }
      addBtn.classList.remove('is-loading');
    });
    sync();
  });
  // PDP gallery
  const stage = $('[data-pdp-stage]');
  if (stage) {
    const img = $('img', stage);
    window.APDS.pdpShow = (src) => {
      if (!src || img.src.includes(src.split('?')[0].split('/').pop())) return;
      img.style.opacity = 0;
      setTimeout(() => { img.src = src; img.srcset = ''; img.style.opacity = 1; }, 180);
    };
    $$('[data-thumb]').forEach((t) => t.addEventListener('click', () => {
      $$('[data-thumb]').forEach((x) => x.classList.remove('is-active'));
      t.classList.add('is-active');
      window.APDS.pdpShow(t.dataset.thumb);
    }));
    if (!reduce && matchMedia('(hover:hover)').matches) {
      stage.addEventListener('pointermove', (e) => {
        const r = stage.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        img.style.transform = `rotateY(${px * 14}deg) rotateX(${-py * 14}deg) scale(1.04)`;
      });
      stage.addEventListener('pointerleave', () => { img.style.transform = ''; });
    }
  }
}

/* ---------------- start up + page modules ---------------- */
async function main() {
  initSound();
  initNav();
  initCursor();
  initTransitions();
  Cart.init();
  initProductForms();
  tiltCards();
  initReveals();
  const base = new URL('.', import.meta.url).href;
  const mods = [];
  if ($('[data-vs]')) mods.push(import(SHOP.modules?.vs || base + 'side-select.js'));
  if ($('[data-world]')) mods.push(import(SHOP.modules?.world || base + 'world.js'));
  if ($('[data-pdp-model]')) mods.push(import(base + 'product-viewer.js'));
  if ($('[data-card-model]')) mods.push(import(base + 'card-models.js'));
  if ($('[data-oi]')) mods.push(import(base + 'object-index.js'));
  if ($('[data-hoodie]')) mods.push(import(base + 'floating-hoodie.js'));
  if ($('[data-gallery]')) mods.push(import(SHOP.modules?.gallery || base + 'gallery.js'));
  if ($('[data-fitlab]')) mods.push(import(SHOP.modules?.fitlab || base + 'fitlab.js'));
  const loaded = await Promise.allSettled(mods);
  loaded.forEach((r) => { if (r.status === 'rejected') console.warn('[APDS] module failed', r.reason); });
  document.dispatchEvent(new CustomEvent('apds:ready'));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main); else main();
