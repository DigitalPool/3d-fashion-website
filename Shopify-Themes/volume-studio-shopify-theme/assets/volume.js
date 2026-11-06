import * as THREE from 'three';
import { RoomEnvironment } from './room-environment.js';
import { buildGarment, releaseGarment } from './volume-geometry.js';
import { productKey, productThumbnail } from './product-media.js';

const { Cart, reduce } = window.APDS;
const root = document.querySelector('[data-volume]');
const get = (name) => root.querySelector('[data-volume-' + name + ']');
const data = JSON.parse(get('data').textContent);
const products = data.products.filter((product) => product.variants?.length);
const order = ['apsht-cropped-set','where-is-my-money-tee','mugshot-tee','ap-knit-balaclava'];
const score = (product) => {
  if (product.handle === data.featured) return -1;
  const index = order.indexOf(productKey(product));
  return index < 0 ? order.length : index;
};
products.sort((a, b) => score(a) - score(b));
const modelTypes = {
  'apsht-cropped-set': { kind:'hoodie', shade:'#29272c', note:'3D study of the cropped hoodie' },
  'where-is-my-money-tee': { kind:'black-tee', shade:'#26242a', note:'3D garment study' },
  'mugshot-tee': { kind:'white-tee', shade:'#ddd8cc', note:'3D garment study' },
  'ap-knit-balaclava': { kind:'mask', shade:'#242126', note:'3D knit study' },
};

const canvas = get('canvas'), viewport = get('viewport'), tools = get('tools');
let poster = viewport.querySelector('img');
if (!poster) { poster = document.createElement('img'); poster.hidden = true; viewport.prepend(poster); }
const form = get('form'), rail = get('rail'), options = get('options'), stage = get('stage'), parts = get('parts');
const purchase = form?.querySelector('button');
let selected, variant, part = 'hoodie', pending = false, revision = 0, viewer;

function button(text, label) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  if (label) element.setAttribute('aria-label', label);
  return element;
}

const cards = products.map((product, index) => {
  const element = button('', 'View ' + product.title);
  const thumb = document.createElement('img');
  const num = document.createElement('span');
  const image = productThumbnail(product);
  if (image) { thumb.src = image; thumb.alt = ''; thumb.loading = 'lazy'; element.append(thumb); }
  num.textContent = String(index + 1).padStart(2, '0');
  element.append(num);
  element.addEventListener('click', () => selectProduct(product));
  rail?.append(element);
  return element;
});

function selectProduct(product) {
  selected = product;
  part = 'hoodie';
  const index = products.indexOf(product);
  cards.forEach((card, i) => card.setAttribute('aria-pressed', String(index === i)));
  get('number').textContent = String(index + 1).padStart(2, '0');
  get('name').textContent = product.title;
  get('details').href = product.url;
  get('status').textContent = '';
  selectVariant(product.variants.find((item) => item.available) || product.variants[0]);
}

function selectVariant(value) {
  variant = value;
  get('price').textContent = Cart.money(value.price);
  if (form) form.elements.id.value = value.id;
  if (purchase) {
    purchase.disabled = pending || !value.available;
    purchase.firstChild.textContent = value.available ? 'Add to bag ' : 'Sold out ';
  }
  options.replaceChildren();
  if (selected.variants.length > 1) {
    const label = document.createElement('label');
    label.textContent = selected.options.filter((option) => option !== 'Title').join(' / ') || 'Option';
    const select = document.createElement('select');
    for (const item of selected.variants) {
      const option = new Option(item.title + (item.available ? '' : ' · Sold out'), String(item.id), false, item.id === value.id);
      option.disabled = !item.available;
      select.add(option);
    }
    select.addEventListener('change', () => {
      selectVariant(selected.variants.find((item) => String(item.id) === select.value));
      options.querySelector('select')?.focus({preventScroll:true});
    });
    label.append(select);
    options.append(label);
  }
  showProduct();
}

async function showProduct() {
  const ticket = ++revision;
  const key = productKey(selected);
  const set = key === 'apsht-cropped-set';
  const model = set && part === 'trousers' ? { kind:'trousers', shade:'#29272c', note:'3D study of the track trousers' } : modelTypes[key];
  parts.hidden = !set;
  parts.replaceChildren();
  if (set) {
    for (const [kind, label] of [['hoodie','Hoodie'],['trousers','Trousers']]) {
      const control = button(label);
      control.setAttribute('aria-pressed', String(kind === part));
      control.addEventListener('click', () => {
        if (kind === part) return;
        part = kind;
        showProduct();
        parts.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
      });
      parts.append(control);
    }
  }
  const colorIndex = selected.options.findIndex((name) => /colou?r|shade/i.test(name));
  const color = variant.options?.[colorIndex]?.trim().toLowerCase();
  const compatible = !color || color === (key === 'mugshot-tee' ? 'white' : 'black') ||
    (key === 'ap-knit-balaclava' && /^(cream|white|ivory)$/.test(color));
  const image = productThumbnail(selected, variant);
  poster.hidden = !image;
  if (image) { poster.src = image; poster.alt = selected.title; }
  canvas.hidden = true;
  tools.hidden = true;
  stage.classList.remove('has-model');
  get('angle').textContent = 'PRODUCT VIEW';
  get('note').textContent = 'Studio imagery';
  viewer?.clear();
  if (!model || !compatible) return;
  try {
    viewer ||= createViewer();
    const printUrl = data.prints[key];
    const print = printUrl ? await new THREE.TextureLoader().loadAsync(printUrl).catch(() => null) : null;
    if (ticket !== revision) { print?.dispose(); return; }
    if (print) print.colorSpace = THREE.SRGBColorSpace;
    const garment = buildGarment(model.kind, color && /^(cream|white|ivory)$/.test(color) && key === 'ap-knit-balaclava' ? '#e5dbc4' : model.shade, print);
    canvas.hidden = false;
    poster.hidden = true;
    tools.hidden = false;
    stage.classList.add('has-model');
    get('note').textContent = model.note;
    viewer.show(garment);
  } catch (error) {
    if (ticket !== revision) return;
    poster.hidden = !image;
    canvas.hidden = true;
    tools.hidden = true;
    stage.classList.remove('has-model');
    get('note').textContent = 'Studio imagery';
    console.warn('Volume Studio preview unavailable', error);
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending || !variant?.available) return;
  pending = true;
  purchase.disabled = true;
  const requested = variant.id;
  get('status').textContent = 'Adding to bag…';
  try {
    await Cart.add(requested);
    get('status').textContent = 'Added to bag.';
  } catch (error) {
    get('status').textContent = error.message || 'Could not add this item.';
  } finally {
    pending = false;
    purchase.disabled = !variant.available;
  }
});

function createViewer() {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.38;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment,.04).texture;
  environment.dispose();
  pmrem.dispose();
  scene.environmentIntensity = .82;
  const pivot = new THREE.Group();
  scene.add(pivot);
  function light(color, intensity, x, y, z) {
    const lamp = new THREE.DirectionalLight(color,intensity);
    lamp.position.set(x,y,z); scene.add(lamp);
  }
  light('#ffbf95',3.1,-3,3,4);
  light('#a994ff',2.1,3,1,-3);
  light('#fff4e7',1.1,2,0,4);
  const camera = new THREE.PerspectiveCamera(32, 1, .05, 60);
  let targetYaw = .28, yaw = .28, targetPitch = -.07, pitch = -.07, distance = 5.9;
  let garment, drag, frame, visible = true;
  const angle = get('angle');
  function render() {
    if (!garment || !visible) return;
    const ease = reduce ? 1 : .19;
    yaw += (targetYaw - yaw) * ease;
    pitch += (targetPitch - pitch) * ease;
    pivot.rotation.set(pitch,yaw,0);
    camera.position.set(0, 0, distance);
    renderer.render(scene,camera);
    angle.textContent = String((Math.round(yaw * 180 / Math.PI) % 360 + 360) % 360).padStart(3,'0') + '° / LIVE 3D';
    if (Math.abs(yaw - targetYaw) + Math.abs(pitch - targetPitch) > .001) invalidate();
  }
  function invalidate() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; render(); });
  }
  function layout() {
    const {clientWidth:w,clientHeight:h} = viewport;
    if (!w || !h) return;
    renderer.setSize(w,h,false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < .8 ? 42 : 32;
    camera.updateProjectionMatrix();
    invalidate();
  }
  new ResizeObserver(layout).observe(viewport);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) invalidate(); }).observe(viewport);
  const actions = {
    left: () => { targetYaw -= Math.PI / 4; },
    right: () => { targetYaw += Math.PI / 4; },
    'zoom-in': () => { distance = Math.max(3.3,distance - .55); },
    'zoom-out': () => { distance = Math.min(8.5,distance + .55); },
    reset: () => { targetYaw = yaw + (.28 - yaw % (Math.PI * 2)); targetPitch = -.07; distance = 5.9; },
  };
  function action(key) { actions[key]?.(); invalidate(); }
  tools.addEventListener('click', (event) => action(event.target.closest('[data-orbit-action]')?.dataset.orbitAction));
  canvas.addEventListener('pointerdown', (event) => {
    if (drag || event.button !== 0) return;
    drag = { id:event.pointerId, x:event.clientX, y:event.clientY, yaw:targetYaw, pitch:targetPitch };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    targetYaw = drag.yaw + (event.clientX - drag.x) * .012;
    targetPitch = THREE.MathUtils.clamp(drag.pitch + (event.clientY - drag.y) * .007, -.7,.7);
    invalidate();
  });
  canvas.addEventListener('lostpointercapture', (event) => { if (drag?.id === event.pointerId) drag = null; });
  canvas.addEventListener('keydown', (event) => {
    const key = {ArrowLeft:'left',ArrowRight:'right','+':'zoom-in','=':'zoom-in','-':'zoom-out',Home:'reset'}[event.key];
    if (!key) return;
    event.preventDefault();
    action(key);
  });
  function clear() {
    if (!garment) return;
    pivot.remove(garment);
    releaseGarment(garment);
    garment = null;
  }
  return {
    clear,
    show(next) {
      clear();
      garment = next;
      const box = new THREE.Box3().setFromObject(garment);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const scale = 2.55 / Math.max(size.y,size.x);
      garment.scale.setScalar(scale);
      garment.position.copy(center.multiplyScalar(-scale));
      pivot.add(garment);
      yaw = targetYaw = .28; pitch = targetPitch = -.07; distance = 5.9;
      layout();
    },
  };
}

if (products.length && form) selectProduct(products[0]);
