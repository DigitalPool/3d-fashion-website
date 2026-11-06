/* SELECT OUTFIT | brand world: WebGL stage + game menu + equip panel */
import * as THREE from 'three';
import { createPhotoStage, productViews, productThumbnail } from './product-media.js';
import { initLookbook } from './fit-reel.js';
import { createModelViewer } from './model-viewer.js';

const { $, $$, Sound, Cart, reduce } = window.APDS;
const root = $('[data-world]');
const data = JSON.parse($('script[data-world-json]', root).textContent);
const brand = data.brand === 'ds' ? 'ds' : 'ap';
document.body.dataset.side = brand;
const SHOP = window.SHOP || {};

const els = {
  canvas: $('.world__gl', root),
  list: $('[data-menu-list]', root),
  stage: $('[data-stage]', root),
  name: $('[data-look-name]', root),
  sub: $('[data-look-sub]', root),
  idx: $('[data-look-idx]', root),
  items: $('[data-items]', root),
  stats: $('[data-stats]', root),
  total: $('[data-total]', root),
  equipAll: $('[data-equip-all]', root),
  prev: $('[data-prev]', root),
  next: $('[data-next]', root),
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const looks = (data.looks || []).filter((l) => l.image || l.video || (l.products && l.products.length));
let active = 0;
const selected = new Map(); // productId -> variantId

/* ---------- helpers ---------- */
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function statsFor(look) {
  const h = hash(look.name || 'x');
  const labels = data.stats && data.stats.length ? data.stats : ['Drip', 'Heat', 'Rarity', 'Menace'];
  return labels.map((l, i) => ({ label: l, v: 62 + ((h >>> (i * 5)) % 37) }));
}
function scramble(el, text) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-entering');
  void el.offsetWidth;
  el.classList.add('is-entering');
}
const photoStage = $('[data-photo-stage]', root);
const photos = photoStage ? createPhotoStage(photoStage) : null;

/* ---------- the selected product's 3D model as the stage ---------- */
const modelBox = $('[data-world-model]', root);
const modelFallback = modelBox && $('[data-world-model-fallback]', modelBox);
let modelViewer = null;
function showModel(look) {
  const product = look.products?.[0];
  if (!product) return;
  const variant = variantFor(product);
  const colourIndex = (product.options || []).findIndex((option) => /colou?r/i.test(option));
  const colour = colourIndex < 0 ? '' : String(variant?.options?.[colourIndex] || '').trim().toLowerCase();
  const url = product.models && (product.models.colours?.[colour] || product.models.default);
  modelFallback.hidden = Boolean(url && modelViewer);
  if (!url || !modelViewer) {
    modelFallback.src = productThumbnail(product, variant);
    return;
  }
  if (url === modelBox.dataset.url) return;
  modelBox.dataset.url = url;
  modelBox.classList.add('is-loading');
  modelViewer.setModel(url).then((done) => { if (done) modelBox.classList.remove('is-loading'); }).catch((error) => {
    console.warn('[APDS] 3D model unavailable', error);
    modelBox.classList.remove('is-loading');
    modelFallback.src = productThumbnail(product, variant);
    modelFallback.hidden = false;
  });
}

/* ---------- drop reel as the stage (replaces the photos) ---------- */
const reelCaption = $('[data-reel-caption]', root);
let reelLooks = null, reelLook = null, reelReady = false, reelTarget = null, reelTargetTimer;

function updateReelCaption() {
  if (!reelCaption || !reelLook) return;
  reelCaption.textContent = reelLook.generated ? looks[active].name : 'On model · ' + looks[active].name;
}
function onReelChange(look) {
  reelLook = look;
  updateReelCaption();
  if (!reelReady) return;
  if (reelTarget) { // passing other looks on the way to a chosen one
    if (look === reelTarget) reelTarget = null;
    return;
  }
  const id = looks[active].products[0]?.id;
  if (look.pieces.some((piece) => piece.product?.id === id)) return;
  const next = looks.findIndex((l) => l.products[0]?.id === look.pieces[0]?.product?.id);
  if (next >= 0) setLook(next, false, true);
}
function jumpReelTo(product) {
  const wearing = reelLooks.filter((look) => look.pieces.some((piece) => piece.product?.id === product?.id));
  const target = wearing.find((look) => look.pieces.length === 1) || wearing[0];
  if (!target || target === reelLook) return;
  reelTarget = target;
  clearTimeout(reelTargetTimer);
  reelTargetTimer = setTimeout(() => { reelTarget = null; }, 1500);
  reelLooks.goTo(target);
}

/* ---------- menu ---------- */
function buildMenu() {
  els.list.innerHTML = looks.map((l, i) => `
    <li class="menu__item${i === 0 ? ' is-active' : ''}">
      <button type="button" data-look="${i}" aria-pressed="${i === 0}">
        <small>${String(i + 1).padStart(2, '0')}</small><span>${esc(l.name)}</span><em>${l.products ? l.products.length : 0} ${l.products && l.products.length === 1 ? 'item' : 'items'}</em>
      </button>
    </li>`).join('');
  els.list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-look]');
    if (b) setLook(+b.dataset.look);
  });
}

/* ---------- equip panel ---------- */
function variantFor(p) {
  const id = selected.get(p.id);
  return p.variants.find((v) => v.id === id) || p.variants.find((v) => v.available) || p.variants[0];
}
function showLook(look, { reset = false, product, variant } = {}) {
  if (modelBox) showModel(look);
  if (!photos) return;
  const entries = (look.products || []).flatMap((p) => productViews(p, variantFor(p)));
  if (look.image) entries.unshift({ src: look.image, label: look.name, model: true });
  if (look.video) entries.unshift({ src: look.image, video: look.video, label: look.name });
  photos.show(entries, { reset, preferred: product && productViews(product, variant)[0]?.src });
}
function renderItems(look) {
  const prods = look.products || [];
  if (!prods.length) {
    els.items.innerHTML = `<div class="world__empty">No items linked to this look yet. Add products to this look in the theme editor.</div>`;
    els.total.textContent = Cart.money(0);
    els.equipAll.disabled = true;
    return;
  }
  els.items.innerHTML = prods.map((p, i) => {
    const v = variantFor(p);
    const multi = p.variants.length > 1;
    return `
    <article class="item" style="--i:${i}" data-pid="${p.id}">
      <a class="item__img" href="${esc(p.url)}"><img src="${esc(productThumbnail(p, v))}" alt="${esc(p.title)}" loading="lazy" width="78" height="78"></a>
      <div>
        <h4 class="item__title"><a href="${esc(p.url)}">${esc(p.title)}</a></h4>
        <div class="price" data-p-price>${Cart.money(v.price)}${v.compare_at_price > v.price ? `<s>${Cart.money(v.compare_at_price)}</s>` : ''}</div>
        ${multi ? `<div class="chips" role="group" aria-label="Variant">${p.variants.map((vv) => `<button type="button" class="chip${vv.id === v.id ? ' is-active' : ''}${vv.available ? '' : ' is-soldout'}" data-variant="${vv.id}" ${vv.available ? '' : 'disabled'}>${esc(vv.title)}</button>`).join('')}</div>` : ''}
        <div class="item__row">
          <span class="tag">${v.available ? 'In stock' : 'Sold out'}</span>
          <button type="button" class="item__add" data-add-one ${v.available ? '' : 'disabled'}>Add +</button>
        </div>
      </div>
    </article>`;
  }).join('');
  updateTotal(look);
}
function updateTotal(look) {
  const prods = look.products || [];
  const vs = prods.map(variantFor).filter((v) => v && v.available);
  els.total.textContent = Cart.money(vs.reduce((s, v) => s + v.price, 0));
  els.equipAll.disabled = !vs.length;
}
els.items.addEventListener('click', async (e) => {
  const art = e.target.closest('[data-pid]');
  if (!art) return;
  const look = looks[active];
  const p = look.products.find((x) => String(x.id) === art.dataset.pid);
  const chip = e.target.closest('[data-variant]');
  if (chip) {
    selected.set(p.id, +chip.dataset.variant);
    $$('[data-variant]', art).forEach((c) => c.classList.toggle('is-active', c === chip));
    const v = variantFor(p);
    $('[data-p-price]', art).innerHTML = Cart.money(v.price);
    Sound.play('tick');
    updateTotal(look);
    showLook(look, { product: p, variant: v });
    const thumbnail = $('.item__img img', art);
    const thumbnailUrl = productThumbnail(p, v);
    if (thumbnailUrl) thumbnail.src = thumbnailUrl;
    return;
  }
  const add = e.target.closest('[data-add-one]');
  if (add) {
    add.disabled = true;
    try { await Cart.add(variantFor(p).id, 1); } catch (err) { Sound.play('error'); }
    add.disabled = false;
  }
});
els.equipAll.addEventListener('click', async () => {
  const look = looks[active];
  const items = (look.products || []).map(variantFor).filter((v) => v && v.available).map((v) => ({ id: v.id, quantity: 1 }));
  if (!items.length) return;
  els.equipAll.classList.add('is-loading');
  try { await Cart.add(items); } catch (err) { Sound.play('error'); }
  els.equipAll.classList.remove('is-loading');
});

function renderStats(look) {
  els.stats.innerHTML = statsFor(look).map((s) => `<div class="equip__stat"><span>${esc(s.label)}</span><i><b style="width:0"></b></i><span>${s.v}</span></div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('b', els.stats).forEach((b, i) => { b.style.width = statsFor(look)[i].v + '%'; });
  }));
}

/* ---------- WebGL stage ---------- */
const SIMPLE_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`;

const CONE_FRAG = /* glsl */`
varying vec2 vUv; uniform vec3 uAccent; uniform float uTime;
void main(){
  float a = pow(vUv.y, 1.6) * .16 * (.85 + .15 * sin(uTime * 3.));
  float side = sin(vUv.x * 3.14159);
  gl_FragColor = vec4(mix(vec3(1.), uAccent, .55), a * side);
}`;

const BF_VERT3 = /* glsl */`
attribute vec4 aSeed; attribute float aSize;
uniform float uTime;
varying vec2 vUv; varying float vA;
void main(){
  vUv = uv;
  float t = uTime * aSeed.w;
  vec3 c = vec3(aSeed.x * 9. - 4.5, mod(aSeed.y * 6. + t * .35, 6.) - 2.6, aSeed.z * 4. - 2.8);
  c.x += sin(t + aSeed.z * 9.) * .4;
  vA = smoothstep(-2.6, -1.8, c.y) * smoothstep(3.4, 2.4, c.y);
  float flap = mix(.15, 1., abs(sin(uTime * (8. + aSeed.w * 6.) + aSeed.z * 30.)));
  vec3 p = position; p.x *= flap;
  vec4 mv = modelViewMatrix * vec4(c, 1.);
  mv.xy += p.xy * aSize;
  gl_Position = projectionMatrix * mv;
}`;
const BF_FRAG3 = /* glsl */`
uniform sampler2D uTex; uniform vec3 uCol; varying vec2 vUv; varying float vA;
void main(){ float a = texture2D(uTex, vUv).a; if (a < .05) discard; gl_FragColor = vec4(uCol, a * vA * .85); }`;

const SPARK_VERT = /* glsl */`
attribute vec4 aSeed; uniform float uTime, uPx; varying float vA;
void main(){
  float t = uTime * aSeed.w;
  vec3 c = vec3(aSeed.x * 9. - 4.5, mod(aSeed.y * 6. + t * .5, 6.) - 2.4, aSeed.z * 4. - 2.5);
  c.x += sin(t * 2. + aSeed.z * 20.) * .12;
  vA = smoothstep(-2.4, -1.6, c.y) * smoothstep(3.6, 1.6, c.y);
  vec4 mv = modelViewMatrix * vec4(c, 1.);
  gl_PointSize = (2. + aSeed.z * 4.) * uPx * (3. / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_FRAG = /* glsl */`
uniform vec3 uCol; varying float vA;
void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(mix(uCol, vec3(1.,.85,.7), a * .5), a * vA); }`;

function css(name, fb) { return new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb); }

async function initBackdrop() {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); }
  catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.15, 9);
  const accent = css(brand === 'ds' ? '--ds' : '--ap', brand === 'ds' ? '#ff4fa0' : '#e3122c');
  const accent2 = css(brand === 'ds' ? '--ds-2' : '--ap-2', brand === 'ds' ? '#ffc2dd' : '#ff3b52');
  const T = { value: 0 };
  // backdrop
  const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.ShaderMaterial({
    vertexShader: SIMPLE_VERT, fragmentShader: BACK_FRAG, depthWrite: false,
    uniforms: { uTime: T, uBrand: { value: brand === 'ds' ? 1 : 0 }, uAccent: { value: accent }, uAccent2: { value: accent2 } },
  }));
  back.position.set(0, 2.2, -6);
  scene.add(back);

  // floor grid
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), new THREE.ShaderMaterial({
    vertexShader: SIMPLE_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false,
    uniforms: { uTime: T, uAccent: { value: accent } },
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.86, -2);
  scene.add(floor);

  // spotlight cone
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 2.6, 7, 48, 1, true), new THREE.ShaderMaterial({
    vertexShader: SIMPLE_VERT, fragmentShader: CONE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uAccent: { value: accent }, uTime: T },
  }));
  cone.position.set(0, 1.6, -0.6);
  scene.add(cone);

  // particles
  if (brand === 'ds') {
    const mask = await new Promise((res) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 206; c.getContext('2d').drawImage(img, 8, 8, 240, 190); res(new THREE.CanvasTexture(c)); };
      img.onerror = () => res(null); img.src = SHOP.assets?.butterfly;
    });
    if (mask) {
      const N = 26;
      const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 0.8));
      const seeds = new Float32Array(N * 4), sizes = new Float32Array(N);
      for (let i = 0; i < N; i++) { seeds.set([Math.random(), Math.random(), Math.random(), 0.3 + Math.random() * 0.7], i * 4); sizes[i] = 0.12 + Math.random() * 0.22; }
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
      geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
      geo.instanceCount = N;
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: BF_VERT3, fragmentShader: BF_FRAG3, transparent: true, depthWrite: false, uniforms: { uTex: { value: mask }, uTime: T, uCol: { value: accent2 } } }));
      m.frustumCulled = false;
      scene.add(m);
    }
  } else {
    const N = 220;
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) seeds.set([Math.random(), Math.random(), Math.random(), 0.3 + Math.random()], i * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: T, uPx: { value: renderer.getPixelRatio() }, uCol: { value: accent } } }));
    pts.frustumCulled = false;
    scene.add(pts);
  }

  // layout: centre the camera projection on the stage column
  const layout = () => {
    const sr = els.stage.getBoundingClientRect(), rr = root.getBoundingClientRect();
    const w = root.clientWidth;
    const h = innerWidth <= 1100 ? Math.min(root.clientHeight, Math.round(sr.bottom - rr.top + 60)) : root.clientHeight;
    els.canvas.style.height = innerWidth <= 1100 ? h + 'px' : '';
    renderer.setSize(w, h, false);
    const vh = Math.min(h, innerHeight);
    const cx = sr.left - rr.left + sr.width / 2;
    const cy = sr.top - rr.top + sr.height * 0.5;
    camera.aspect = w / h;
    const targetPx = Math.min(sr.height * 0.66, vh * 0.6);
    const visH = (3.6 * h) / Math.max(targetPx, 200);
    const fit = Math.min(1, (sr.width * 0.9) / (targetPx * 0.95));
    camera.position.z = visH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / fit;
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy + targetPx * 0.1, w, h);
    camera.updateProjectionMatrix();
  };
  layout();
  addEventListener('resize', layout);
  new ResizeObserver(layout).observe(els.stage);

  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(root);
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    T.value += reduce ? 0 : dt;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  });

}

/* ---------- look switching ---------- */
function setLook(i, first = false, fromReel = false) {
  if (!looks.length) return;
  i = (i + looks.length) % looks.length;
  if (i === active && !first) return;
  active = i;
  const look = looks[i];
  $$('.menu__item', els.list).forEach((li, k) => {
    li.classList.toggle('is-active', k === i);
    li.querySelector('button').setAttribute('aria-pressed', String(k === i));
  });
  const btn = $(`[data-look="${i}"]`, els.list);
  if (btn && !first && btn.parentElement.parentElement.scrollWidth > btn.parentElement.parentElement.clientWidth) btn.parentElement.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  scramble(els.name, look.name);
  if (els.sub) els.sub.textContent = look.blurb || `${(look.products || []).length} piece${(look.products || []).length === 1 ? '' : 's'}`;
  els.idx.textContent = `${String(i + 1).padStart(2, '0')} / ${String(looks.length).padStart(2, '0')}`;
  renderItems(look);
  renderStats(look);
  if (!first) Sound.play('swap');
  showLook(look, { reset: true });
  if (reelLooks && !first && !fromReel) jumpReelTo(look.products[0]);
  updateReelCaption();
}

function boot() {
  if (!looks.length) {
    els.name.textContent = 'Coming soon';
    els.items.innerHTML = `<div class="world__empty">Add products to this collection, or add Look blocks in the theme editor, and they appear here automatically.</div>`;
    return;
  }
  buildMenu();
  if (modelBox) {
    try { modelViewer = createModelViewer(modelBox); } catch (error) { console.warn('[APDS] 3D stage unavailable', error); }
  }
  if (reelCaption) {
    reelLooks = initLookbook(root, { reelAssets: data.reelAssets, looks: [], products: looks.flatMap((look) => look.products || []) }, { onChange: onReelChange });
  }
  setLook(0, true);
  reelReady = true;
  els.prev?.addEventListener('click', () => setLook(active - 1));
  els.next?.addEventListener('click', () => setLook(active + 1));
  addEventListener('keydown', (e) => {
    if (root.getBoundingClientRect().bottom < innerHeight * 0.4) return; // scrolled past the selector: keep normal page keys
    if (e.defaultPrevented || document.querySelector('.image-inspector[open]') || e.target.closest('input,textarea,select,video,[data-photo-nav]') || document.querySelector('.drawer.is-open')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); setLook(active + 1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); setLook(active - 1); }
  });
  // swipe on touch
  let sx = null;
  els.stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  els.stage.addEventListener('touchend', (e) => {
    if (reelLooks || modelBox || sx === null || e.target.closest('button, video')) { sx = null; return; }
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 70) setLook(active + (dx < 0 ? 1 : -1));
    sx = null;
  });
}
boot();
