/* FIT LAB | cross-brand permutation dressing room */
import * as THREE from 'three';
import { SLOTS, fitInfo, colorChoices } from './fit-map.js';
import { initLookbook } from './fit-reel.js';
import { createPhotoStage, productKey, productThumbnail, productViews } from './product-media.js';

const { $, $$, Sound, Cart, reduce } = window.APDS;
const root = $('[data-fitlab]');
const data = JSON.parse($('script[data-fitlab-json]', root).textContent);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
document.body.dataset.side = 'ds';

/* ---------- catalogue ---------- */
const products = (data.products || []).filter((p) => fitInfo(p));
const bySlot = {};
SLOTS.forEach((s) => { bySlot[s.id] = products.filter((p) => fitInfo(p).slot === s.id); });
const slots = SLOTS.filter((s) => bySlot[s.id].length);

/* state: per slot { p, color } or null; per product size choices */
const state = { sel: {}, sizes: {}, focus: 0 };
const photos = createPhotoStage($('[data-photo-stage]', root));
const looks = initLookbook(root, data);
slots.forEach((s) => { state.sel[s.id] = null; });

function colorIdx(p) { return fitInfo(p).colorIdx; }
function variantOf(p, colorName) {
  const ci = colorIdx(p);
  const want = state.sizes[p.id] || {};
  const match = (v) => (v.options || [v.title]).every((val, i) => (i === ci ? (!colorName || val === colorName) : (want[i] === undefined || want[i] === val)));
  return p.variants.find((v) => match(v) && v.available) || p.variants.find(match) || p.variants.find((v) => v.available) || p.variants[0];
}
function setsTop() { const t = state.sel.top; return t && fitInfo(t.p).type === 'set'; }
function selectedPieces() {
  return slots.filter((s) => s.id !== 'bottom' || !setsTop()).map((s) => state.sel[s.id]).filter(Boolean);
}
const featuredFit = [
  { slot: 'head', key: 'ap-knit-balaclava', color: 'black' },
  { slot: 'top', key: 'mugshot-tee' },
  { slot: 'waist', key: 'ap-belt', color: 'black' },
  { slot: 'bag', key: 'soul-messenger-bag' },
];
function featuredSelections() {
  const selection = {};
  for (const { slot, key, color } of featuredFit) {
    const product = bySlot[slot].find((p) => productKey(p) === key);
    if (!product) return null;
    const colors = colorChoices(product);
    const match = colors.find((choice) => choice.name.trim().toLowerCase() === color && choice.available);
    if (color && colors.length && !match) return null;
    selection[slot] = { p: product, color: match?.name || null };
  }
  return selection;
}
function showPieces(preview) {
  const pieces = selectedPieces();
  const views = pieces.map((x) => productViews(x.p, variantOf(x.p, x.color)));
  // Give each selected piece a view before listing its additional angles.
  const primary = views.map((entries) => entries[0]).filter(Boolean);
  primary.sort((a, b) => Number(Boolean(b.model)) - Number(Boolean(a.model)));
  const match = looks.find((look) => look.pieces.length === pieces.length && look.pieces.every((piece) =>
    pieces.some(({ p, color }) => piece.handle === p.handle &&
      (!piece.color || piece.color === (color || fitInfo(p).baseColor || '').trim().toLowerCase()))));
  if (match) primary.unshift({ src: match.image, label: match.name, model: true, generated: match.generated });
  const preferred = match?.image || (preview && views[pieces.indexOf(preview)]?.[0]?.src);
  photos.show([...primary, ...views.flatMap((entries) => entries.slice(1))], { preferred });
  $('[data-fl-code]', root).textContent = match ? match.name : 'Custom fit · individual piece previews';

}

/* ---------- fit name + permutation count ---------- */
const W1 = ['FERAL', 'OMEN', 'KNIGHT', 'THORN', 'FALLEN', 'CRASH', 'VENOM', 'GHOST', 'RIOT', 'SAINT', 'HEX', 'VELVET', 'STATIC', 'NOVA', 'RUIN', 'SILK'];
const W2 = ['ANGEL', 'SOUL', 'MENACE', 'BUTTERFLY', 'SIGNAL', 'PROPHET', 'SHADOW', 'ROYALTY', 'MONEY', 'MOTH', 'RIDER', 'HEART', 'CIRCUIT', 'WOLF', 'BLOOM', 'ECHO'];
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function fitKey() { return slots.map((s) => { const x = state.sel[s.id]; return x ? x.p.handle + ':' + (x.color || '') : '-'; }).join('/'); }
function fitName() {
  const h = hash(fitKey());
  return { name: `${W1[h % W1.length]} ${W2[(h >>> 7) % W2.length]}`, code: `FIT #${String(h % 100000).padStart(5, '0')}` };
}
function permutations() {
  let n = 1;
  slots.forEach((s) => {
    let k = 1;
    bySlot[s.id].forEach((p) => { k += Math.max(1, colorChoices(p).length); });
    n *= k;
  });
  return n;
}

/* ---------- UI: slots ---------- */
const slotsEl = $('[data-fl-slots]', root);
function optionsFor(slotId) { return [null].concat(bySlot[slotId]); }
function renderSlots() {
  slotsEl.innerHTML = slots.map((s, i) => {
    const x = state.sel[s.id];
    const locked = s.id === 'bottom' && setsTop();
    const label = locked ? 'Included in set' : x ? x.p.title : 'None';
    const chips = x && !locked ? colorChoices(x.p) : [];
    return `
      <div class="fl-slot${i === state.focus ? ' is-focus' : ''}${locked ? ' is-locked' : ''}" data-slot="${s.id}">
        <span class="fl-label">${esc(s.label)}</span>
        <div class="fl-picker">
          <button type="button" class="fl-arrow" data-step="-1" aria-label="Previous ${esc(s.label)}" ${locked ? 'disabled' : ''}>&#9664;</button>
          <span class="fl-val" data-val>${esc(label)}</span>
          <button type="button" class="fl-arrow" data-step="1" aria-label="Next ${esc(s.label)}" ${locked ? 'disabled' : ''}>&#9654;</button>
        </div>
        ${chips.length ? `<div class="fl-swatches" role="group" aria-label="Colour">${chips.map((c) => `<button type="button" class="fl-sw${x.color === c.name ? ' is-on' : ''}" data-color="${esc(c.name)}" style="--c:${c.hex}" title="${esc(c.name)}" aria-label="${esc(c.name)}" ${c.available ? '' : 'disabled'}></button>`).join('')}</div>` : ''}
      </div>`;
  }).join('');
}
slotsEl.addEventListener('click', (e) => {
  const row = e.target.closest('[data-slot]');
  if (!row) return;
  const id = row.dataset.slot;
  state.focus = slots.findIndex((s) => s.id === id);
  const st = e.target.closest('[data-step]');
  if (st) { step(id, +st.dataset.step); return; }
  const sw = e.target.closest('[data-color]');
  if (sw && state.sel[id]) { state.sel[id].color = sw.dataset.color; Sound.play('tick'); commit({ preview: state.sel[id] }); }
});
function step(id, dir) {
  if (id === 'bottom' && setsTop()) return;
  const opts = optionsFor(id);
  const cur = state.sel[id] ? opts.indexOf(state.sel[id].p) : 0;
  const next = opts[(cur + dir + opts.length) % opts.length];
  state.sel[id] = next ? { p: next, color: (colorChoices(next).find((c) => c.available) || {}).name || null } : null;
  Sound.play('tick');
  commit({ preview: state.sel[id] });
}

/* ---------- UI: summary ---------- */
const itemsEl = $('[data-fl-items]', root);
function sizeOptions(p) {
  const ci = colorIdx(p);
  return (p.options || []).map((name, i) => ({ name, i })).filter((o) => o.i !== ci && !/^title$/i.test(o.name))
    .map((o) => ({ ...o, values: Array.from(new Set(p.variants.map((v) => (v.options || [])[o.i]).filter(Boolean))) }));
}
function renderSummary() {
  const worn = selectedPieces();
  $('[data-fl-count]', root).textContent = `${worn.length} piece${worn.length === 1 ? '' : 's'}`;
  if (!worn.length) {
    itemsEl.innerHTML = `<div class="world__empty">Nothing equipped. Pick pieces on the left or hit Shuffle.</div>`;
  } else {
    itemsEl.innerHTML = worn.map((x, i) => {
      const v = variantOf(x.p, x.color);
      const sizes = sizeOptions(x.p);
      if (!state.sizes[x.p.id]) state.sizes[x.p.id] = {};
      sizes.forEach((o) => { if (state.sizes[x.p.id][o.i] === undefined) state.sizes[x.p.id][o.i] = o.values.includes('M') ? 'M' : o.values[0]; });
      return `
      <article class="item" style="--i:${i}" data-pid="${x.p.id}">
        <a class="item__img" href="${esc(x.p.url)}"><img src="${esc(productThumbnail(x.p, v))}" alt="${esc(x.p.title)}" loading="lazy" width="78" height="78"></a>
        <div>
          <h4 class="item__title"><a href="${esc(x.p.url)}">${esc(x.p.title)}</a></h4>
          <div class="price">${Cart.money(v.price)}${x.color ? ` <span class="tag" style="margin-left:6px">${esc(x.color)}</span>` : ''}</div>
          ${sizes.map((o) => `<div class="chips" role="group" aria-label="${esc(o.name)}">${o.values.map((val) => `<button type="button" class="chip${state.sizes[x.p.id][o.i] === val ? ' is-active' : ''}" data-size="${o.i}" data-v="${esc(val)}">${esc(val)}</button>`).join('')}</div>`).join('')}
          <div class="item__row"><span class="tag">${v.available ? 'In stock' : 'Sold out'}</span><button type="button" class="item__add" data-fl-unequip>Remove</button></div>
        </div>
      </article>`;
    }).join('');
  }
  const total = worn.reduce((s, x) => s + variantOf(x.p, x.color).price, 0);
  $('[data-fl-total]', root).textContent = Cart.money(total);
  $('[data-fl-equip]', root).disabled = !worn.length;
}
itemsEl.addEventListener('click', (e) => {
  const art = e.target.closest('[data-pid]');
  if (!art) return;
  const p = products.find((x) => String(x.id) === art.dataset.pid);
  const sz = e.target.closest('[data-size]');
  if (sz) { state.sizes[p.id][+sz.dataset.size] = sz.dataset.v; Sound.play('tick'); renderSummary(); showPieces(); return; }
  if (e.target.closest('[data-fl-unequip]')) {
    const slot = fitInfo(p).slot;
    state.sel[slot] = null; Sound.play('back'); commit();
  }
});
$('[data-fl-equip]', root).addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const items = selectedPieces()
    .map((x) => variantOf(x.p, x.color)).filter((v) => v && v.available).map((v) => ({ id: v.id, quantity: 1 }));
  if (!items.length) return;
  btn.classList.add('is-loading');
  try { await Cart.add(items); } catch (err) { Sound.play('error'); }
  btn.classList.remove('is-loading');
});

/* ---------- HUD ---------- */
function scramble(el, text) {
  if (reduce) { el.textContent = text; return; }
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#*';
  let f = 0; cancelAnimationFrame(el._r);
  const run = () => {
    el.textContent = text.split('').map((c, i) => (c === ' ' || f > i * 1.2 + 4 ? c : chars[(Math.random() * chars.length) | 0])).join('');
    if (f++ < text.length * 1.2 + 6) el._r = requestAnimationFrame(run); else el.textContent = text;
  };
  run();
}
function renderHud() {
  const n = fitName();
  scramble($('[data-fl-name]', root), n.name);
  $('[data-fl-code]', root).textContent = n.code;
  $('[data-fl-perms]', root).textContent = `${permutations().toLocaleString()} POSSIBLE FITS`;
}

/* ---------- commit ---------- */
function commit({ silent, preview } = {}) {
  renderSlots(); renderSummary(); renderHud();
  showPieces(preview);
  if (!silent) Sound.play('swap');
}

/* ---------- shuffle / auto ---------- */
let rolling = false;
function shuffle() {
  if (rolling) return;
  rolling = true;
  const empty = { head: .35, top: .08, bottom: .3, waist: .3, bag: .3 };
  const target = {};
  slots.forEach((s) => {
    const list = bySlot[s.id];
    if (Math.random() < (empty[s.id] ?? .3)) { target[s.id] = null; return; }
    const p = list[(Math.random() * list.length) | 0];
    const cs = colorChoices(p).filter((c) => c.available);
    target[s.id] = { p, color: cs.length ? cs[(Math.random() * cs.length) | 0].name : null };
  });
  // slot-machine roll
  let n = 0;
  const vals = () => $$('[data-slot]', slotsEl);
  const tick = setInterval(() => {
    vals().forEach((row) => {
      const list = optionsFor(row.dataset.slot);
      const r = list[(Math.random() * list.length) | 0];
      $('[data-val]', row).textContent = r ? r.title : 'None';
      row.classList.add('is-rolling');
    });
    Sound.play('hover');
    if (++n > (reduce ? 1 : 9)) {
      clearInterval(tick);
      Object.assign(state.sel, target);
      rolling = false;
      commit();
    }
  }, 65);
}
$('[data-fl-shuffle]', root).addEventListener('click', shuffle);
let auto = null;
$('[data-fl-auto]', root).addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (auto) { clearInterval(auto); auto = null; b.setAttribute('aria-pressed', 'false'); b.textContent = 'Auto'; return; }
  shuffle();
  auto = setInterval(shuffle, 3400);
  b.setAttribute('aria-pressed', 'true'); b.textContent = 'Stop';
});

/* ---------- share link ---------- */
function encodeFit() {
  const o = { s: {} };
  slots.forEach((s) => { const x = state.sel[s.id]; if (x) o.s[s.id] = [x.p.handle, x.color || '']; });
  return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function decodeFit(str) {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))));
    Object.entries(o.s || {}).forEach(([slot, [handle, color]]) => {
      const p = (bySlot[slot] || []).find((x) => x.handle === handle);
      if (p) state.sel[slot] = { p, color: color || null };
    });
    return true;
  } catch (e) { return false; }
}
$('[data-fl-share]', root).addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#fit=${encodeFit()}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('Fit link copied'); } catch (e) { toast('Link in address bar'); }
  Sound.play('coin');
});
function toast(text) {
  const t = document.querySelector('[data-toast]');
  if (!t) return;
  t.querySelector('span').textContent = text;
  t.classList.add('is-on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('is-on'), 1800);
}

/* ---------- keyboard ---------- */
addEventListener('keydown', (e) => {
  if (!$('[data-fit-builder]', root).open || !e.target.closest('[data-fit-builder]') || !slots.length || e.defaultPrevented || e.target.closest('input,textarea,select,[data-photo-nav],button[data-fl-turn]') || document.querySelector('.drawer.is-open')) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); state.focus = (state.focus + 1) % slots.length; renderSlots(); Sound.play('hover'); }
  if (e.key === 'ArrowUp') { e.preventDefault(); state.focus = (state.focus - 1 + slots.length) % slots.length; renderSlots(); Sound.play('hover'); }
  if (e.key === 'ArrowRight') { e.preventDefault(); step(slots[state.focus].id, 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); step(slots[state.focus].id, -1); }
  if (e.key === 'r' || e.key === 'R') shuffle();
});

/* ---------- 3D stage ---------- */
const BACK = /* glsl */`
precision highp float; varying vec2 vUv; uniform float uTime; uniform vec3 uA, uB;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(3.1,1.7); a*=.5; } return v; }
void main(){
  vec2 p = vUv * vec2(2.4, 1.);
  float t = uTime * .05;
  float s = fbm(p * 1.8 + vec2(t, -t) + fbm(p * 3. - t) * 1.3);
  vec3 c = mix(uA, uB, smoothstep(.3, .7, vUv.x + (s - .5) * .3));
  vec3 col = vec3(.01) + c * pow(s, 2.8) * .9;
  vec2 q = vUv - vec2(.5, 1.02); float ang = atan(q.x, -q.y);
  col += mix(uA, uB, vUv.x) * pow(.5 + .5 * sin(ang * 22. + uTime * .15), 10.) * smoothstep(1.1, .2, length(q)) * .14;
  col *= smoothstep(1.05, .25, length((vUv - vec2(.5, .55)) * vec2(1.3, 1.)));
  gl_FragColor = vec4(col, 1.);
}`;
const FLOOR = /* glsl */`
precision highp float; varying vec2 vUv; uniform float uTime; uniform vec3 uA, uB;
void main(){
  vec2 g = vUv * 44.; g.y += uTime * .4;
  vec2 f = abs(fract(g) - .5);
  float line = smoothstep(.47, .5, max(f.x, f.y));
  float fade = smoothstep(.0, .5, vUv.y) * smoothstep(1., .55, vUv.y);
  float glow = smoothstep(.3, .0, length(vUv - vec2(.5, .6)));
  vec3 c = mix(uA, uB, vUv.x);
  gl_FragColor = vec4(c * (line * fade * .6 + glow * .18), max(line * fade * .8, glow * .55));
}`;
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`;

function initBackdrop() {
  const canvasEl = $('.world__gl', root);
  const stageRoot = canvasEl.parentElement;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  const css = (n, f) => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f);
  const A = css('--ap', '#e3122c'), B = css('--ds', '#ff4fa0');
  const T = { value: 0 };
  const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BACK, uniforms: { uTime: T, uA: { value: A }, uB: { value: B } }, depthWrite: false }));
  back.position.set(0, 1.4, -3.2); scene.add(back);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 11), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FLOOR, uniforms: { uTime: T, uA: { value: A }, uB: { value: B } }, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -1); scene.add(floor);
  const camera = new THREE.PerspectiveCamera(26, 1, .1, 50);
  const stageEl = $('[data-stage]', root);
  const layout = () => {
    const sr = stageEl.getBoundingClientRect(), rr = stageRoot.getBoundingClientRect();
    const w = stageRoot.clientWidth;
    const h = innerWidth <= 1100 ? Math.min(stageRoot.clientHeight, Math.round(sr.bottom - rr.top + 60)) : stageRoot.clientHeight;
    canvasEl.style.height = innerWidth <= 1100 ? h + 'px' : '';
    renderer.setSize(w, h, false);
    const cx = sr.left - rr.left + sr.width / 2, cy = sr.top - rr.top + sr.height / 2;
    camera.aspect = w / h;
    const targetPx = Math.min(sr.height * .7, innerHeight * .66);
    const visH = 1.95 * h / Math.max(220, targetPx);
    camera.position.set(0, .98, visH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy + targetPx * .16, w, h);
    camera.updateProjectionMatrix();
  };
  layout(); addEventListener('resize', layout); new ResizeObserver(layout).observe(stageEl);

  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(stageRoot);
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), .05);
    T.value += reduce ? 0 : dt;
    camera.lookAt(0, .98, 0);
    renderer.render(scene, camera);
  });

}

/* ---------- snapshot ---------- */
$('[data-fl-snap]', root).addEventListener('click', async () => {
  const current = photos.image();
  if (!current) { toast('Select a piece with a photo first'); return; }
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = current.currentSrc || current.src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = fitName().name.toLowerCase().replace(/\s+/g, '-') + '.png';
    link.click();
    Sound.play('coin');
    toast('Photo saved');
  } catch (error) {
    toast('This photo could not be saved');
  }
});

/* ---------- boot ---------- */
(function start() {
  const fromHash = location.hash.startsWith('#fit=') && decodeFit(location.hash.slice(5));
  const featured = window.SHOP?.featuredFitPhoto && featuredSelections();
  const featuredButton = $('[data-fl-featured]', root);
  featuredButton.hidden = !featured;
  if (featured) featuredButton.addEventListener('click', () => {
    slots.forEach(({ id }) => { state.sel[id] = featured[id] || null; });
    commit();
  });
  if (!fromHash && featured) Object.assign(state.sel, featured);
  else if (!fromHash) {
    // Start with a photographed look when the catalogue has one.
    const pick = (slot, i = 0) => { const p = bySlot[slot] && bySlot[slot][i]; if (p) state.sel[slot] = { p, color: (colorChoices(p).find((c) => c.available) || {}).name || null }; };
    const modelSet = bySlot.top.findIndex((p) => productViews(p).some((entry) => entry.model));
    pick('top', Math.max(0, modelSet)); pick('waist'); pick('bag');
    if (state.sel.waist) { const red = colorChoices(state.sel.waist.p).find((c) => /red/i.test(c.name)); if (red) state.sel.waist.color = red.name; }
  }
  commit({ silent: true });
  if (!products.length) {
    itemsEl.innerHTML = `<div class="world__empty">No wearable products found. Tag products with fit-tee, fit-belt, fit-balaclava, fit-set, fit-bag-bowling or fit-bag-messenger.</div>`;
  }
  const builder = $('[data-fit-builder]', root);
  if (fromHash) builder.open = true;
  if (builder.open) initBackdrop();
  else builder.addEventListener('toggle', () => { if (builder.open) initBackdrop(); }, { once: true });
})();
