import { inspectImage } from './image-inspect.js';
import { fitInfo } from './fit-map.js';
import { productKey, productThumbnail } from './product-media.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const colorName = (name) => String(name ?? '').trim().toLowerCase();
const number = (value) => String(value).padStart(2, '0');

export function buildLooks(data, shop) {
  const model = (key) => shop.modelPhotos?.[key]?.default;
  const editions = [
    ['Saint Soul', shop.featuredFitPhoto, [['mugshot-tee', 'white', 48, 37], ['ap-knit-balaclava', 'black', 50, 13], ['ap-belt', 'black', 47, 56], ['soul-messenger-bag', 'black', 64, 51]]],
    ['Pink Hour', data.reelAssets?.['pink-hour'], [['where-is-my-money-tee', 'black', 50, 35], ['butterfly-bowling-bag', 'pink', 37, 65]]],
    ['Mugshot Incognito', data.reelAssets?.['mugshot-incognito'], [['mugshot-tee', 'white', 50, 36], ['ap-knit-balaclava', 'black', 50, 14]]],
    ['Midnight Run', data.reelAssets?.['midnight-run'], [['where-is-my-money-tee', 'black', 48, 36], ['soul-messenger-bag', 'black', 42, 51]]],
    ['Money Talk', model('where-is-my-money-tee'), [['where-is-my-money-tee', 'black', 49, 37]]],
    ['Case File', model('mugshot-tee'), [['mugshot-tee', 'white', 50, 34]]],
    ['No Face', model('ap-knit-balaclava'), [['ap-knit-balaclava', 'black', 50, 14]]],
    ['Chrome Signal', model('ap-belt'), [['ap-belt', 'black', 51, 49]]],
    ['Butterfly Effect', model('butterfly-bowling-bag'), [['butterfly-bowling-bag', 'pink', 51, 65]]],
    ['Night Courier', model('soul-messenger-bag'), [['soul-messenger-bag', 'black', 52, 47]]],
    ['Off the Clock', shop.setCutout || shop.productPhotos?.['apsht-cropped-set'], [['apsht-cropped-set', 'black']]],
  ];
  const built = editions.map(([name, image, pieces]) => ({
    name, image, generated: name !== 'Off the Clock',
    pieces: pieces.map(([key, color, x, y]) => ({ key, color, x, y })),
  }));
  return [...(data.looks || []), ...built].filter((look) => look.image && look.pieces.length).map((look) => ({
    ...look,
    pieces: look.pieces.map((piece) => {
      const product = data.products.find((p) => piece.handle ? p.handle === piece.handle : productKey(p) === piece.key);
      return { ...piece, product, handle: product?.handle || piece.handle };
    }),
  }));
}

export function picturedVariants(product, color) {
  const index = fitInfo(product)?.colorIdx ?? -1;
  return (product.variants || []).filter((variant) => !color || index < 0 ||
    colorName(variant.options?.[index]) === color);
}

export function initLookbook(root, data, { onChange } = {}) {
  const { Cart, reduce } = window.APDS;
  const reel = root.querySelector('[data-fit-reel]');
  const get = (key) => reel.querySelector('[data-reel-' + key + ']');
  const track = get('track'), pages = get('pages'), panel = get('products');
  const prev = get('prev'), next = get('next'), full = get('add-look'), status = get('status');
  const hotspots = get('hotspots');
  const looks = buildLooks(data, window.SHOP || {});
  if (!looks.length) { reel.hidden = true; return looks; }
  const wrap = (i) => (i + looks.length) % looks.length;
  const buffer = Math.min(4, looks.length - 1);
  const order = Array.from({ length: looks.length + buffer * 2 }, (_, i) => wrap(i - buffer));
  let active = -1, physical = -1, pending = false, scrollFrame = 0, settleTimer;
  const choices = new Map();
  const slides = order.map((i, position) => {
    const look = looks[i];
    const slide = document.createElement('article');
    slide.className = 'fit-reel__slide';
    slide.setAttribute('aria-label', look.name + ', look ' + (i + 1) + ' of ' + looks.length);
    slide.innerHTML = `
      <div class="fit-reel__portrait">
        <div class="fit-reel__figure"><img src="${escape(look.image)}" alt="${escape(look.name)} editorial outfit" loading="${position <= buffer + 1 ? 'eager' : 'lazy'}" draggable="false">
        ${look.pieces.map(({ product, x, y }, j) => product && Number.isFinite(x) && Number.isFinite(y)
          ? `<button class="fit-reel__pin" type="button" data-piece="${j}" style="--x:${x}%;--y:${y}%" aria-label="Shop ${escape(product.title)}" hidden><span aria-hidden="true">+</span></button>`
          : '').join('')}
      </div></div>
      <div class="fit-reel__label"><strong>${escape(look.name)}</strong></div>`;
    const image = slide.querySelector('img');
    const sizeFigure = () => {
      if (image.naturalHeight) image.parentElement.style.setProperty('--portrait-ratio', image.naturalWidth / image.naturalHeight);
    };
    image.addEventListener('load', sizeFigure);
    if (image.complete) sizeFigure();
    track.append(slide);
    return slide;
  });
  const markers = looks.map((look, i) => {
    const button = document.createElement('button');
    button.type = 'button';

    button.setAttribute('aria-label', look.name);
    button.addEventListener('click', () => go(i + buffer));
    pages.append(button);
    return button;
  });

  function lines() {
    return looks[active].pieces.map((piece, i) => {
      const product = piece.product;
      const variants = product ? picturedVariants(product, piece.color) : [];
      const remembered = choices.get(active + ':' + i);
      const chosen = variants.find((v) => String(v.id) === remembered) || variants.find((v) => v.available) || variants[0];
      return { ...piece, variants, chosen };
    });
  }

  function totals() {
    const selected = lines();
    const available = selected.every(({ chosen }) => chosen?.available);
    get('total').textContent = available ? Cart.money(selected.reduce((sum, { chosen }) => sum + chosen.price, 0)) : '—';
    full.disabled = pending || !available;
    panel.querySelectorAll('[data-add-piece]').forEach((button) => {
      button.disabled = pending || !selected[Number(button.dataset.addPiece)].chosen?.available;
    });
  }

  function renderPanel(look) {
    get('index').textContent = 'Shop the look';
    get('title').textContent = look.name;
    get('credit').textContent = look.generated ? 'Lookbook' : 'On-model photography';
    status.textContent = '';
    panel.innerHTML = lines().map(({ product, variants, chosen }, i) => {
      if (!product) return `<p class="fit-reel__missing">Piece ${number(i + 1)} is currently unavailable.</p>`;
      const thumb = productThumbnail(product, chosen);
      return `<article class="fit-reel__item" data-line="${i}" tabindex="-1">
        <a class="fit-reel__thumb" href="${escape(product.url)}">${thumb ? `<img src="${escape(thumb)}" alt="${escape(product.title)}" loading="lazy">` : escape(number(i + 1))}</a>
        <div class="fit-reel__item-info">
          <a href="${escape(product.url)}">${escape(product.title)}</a>
          <span data-line-price>${chosen ? escape(Cart.money(chosen.price)) : 'Pictured option unavailable'}</span>
          ${variants.length > 1 ? `<label>Choose option <select data-variant="${i}">${variants.map((variant) =>
            `<option value="${escape(variant.id)}" ${variant === chosen ? 'selected' : ''} ${variant.available ? '' : 'disabled'}>${escape(variant.title)}${variant.available ? '' : ' · Sold out'}</option>`).join('')}</select></label>`
            : chosen && chosen.title !== 'Default Title' ? `<small>${escape(chosen.title)}</small>` : ''}
          <button type="button" class="fit-reel__add" data-add-piece="${i}">${chosen && !chosen.available ? 'Sold out' : 'Add to bag +'}</button>
        </div>
      </article>`;
    }).join('');
    totals();
  }

  function activate(position) {
    if (position === physical) return;
    const i = order[position];
    const changed = i !== active;
    if (physical >= 0) {
      slides[physical].classList.remove('is-current');
      slides[physical].querySelectorAll('[data-piece]').forEach((pin) => { pin.hidden = true; });
    }
    if (changed && active >= 0) markers[active].removeAttribute('aria-current');
    physical = position;
    active = i;
    if (changed) {
      reel.classList.remove('show-pins');
      hotspots.setAttribute('aria-pressed', 'false');
    }
    const slide = slides[position];
    slide.classList.add('is-current');
    const pins = slide.querySelectorAll('[data-piece]');
    pins.forEach((pin) => { pin.hidden = false; pin.classList.remove('is-near'); });
    hotspots.hidden = !pins.length;
    markers[i].setAttribute('aria-current', 'true');
    prev.disabled = next.disabled = looks.length < 2;
    if (changed) {
      renderPanel(looks[i]);
      onChange?.(looks[i]);
    }
  }

  function center(slide) { return slide.offsetLeft + slide.offsetWidth / 2; }
  function go(i, instant = false) {
    if (i < 0 || i >= slides.length) return;
    track.scrollTo({ left: center(slides[i]) - track.clientWidth / 2, behavior: instant || reduce ? 'instant' : 'smooth' });
  }
  function normalize() {
    if (drag?.moved || physical === active + buffer) return;
    go(active + buffer, true);
    updateStage();
  }
  function updateStage() {
    const middle = track.scrollLeft + track.clientWidth / 2;
    let nearest = 0;
    slides.forEach((slide, i) => {
      const distance = center(slide) - middle;
      if (Math.abs(distance) < Math.abs(center(slides[nearest]) - middle)) nearest = i;
      const offset = distance / Math.max(1, slide.offsetWidth);
      const depth = Math.abs(offset);
      const travel = track.clientWidth * .48 * (1 - Math.exp(-depth * .62));
      const rise = Math.min(105, track.clientWidth * .12) * (1 - Math.exp(-depth * .68));
      slide.style.setProperty('--reel-x', (Math.sign(offset) * travel - distance) + 'px');
      slide.style.setProperty('--reel-y', -rise + 'px');
      slide.style.setProperty('--reel-scale', 1 / (1 + .34 * Math.pow(depth, 1.25)));
      slide.style.setProperty('--reel-opacity', Math.max(0, Math.min(1 - depth * .17, (4.15 - depth) * .85)));
      slide.style.zIndex = Math.max(0, Math.round(100 - depth * 20));
      slide.classList.toggle('is-distant', depth >= 4.1);
    });
    activate(nearest);
    return nearest;
  }
  track.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateStage();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(normalize, 160);
    });
  }, { passive: true });

  let drag, suppressClick = false;
  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button')) return;
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX, left: track.scrollLeft, moved: false };
  });
  track.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      track.setPointerCapture(event.pointerId);
      track.classList.add('is-dragging');
    }
    if (drag.moved) track.scrollLeft = drag.left - dx;
  });
  function release(event) {
    if (drag?.id !== event.pointerId) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return;
    suppressClick = true;
    track.classList.remove('is-dragging');
    go(updateStage());
    setTimeout(() => { suppressClick = false; }, 0);
  }
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  track.addEventListener('lostpointercapture', release);
  function clearPins() {
    slides[physical]?.querySelectorAll('[data-piece]').forEach((pin) => pin.classList.remove('is-near'));
  }
  track.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || drag?.moved) return;
    slides[physical]?.querySelectorAll('[data-piece]').forEach((pin) => {
      const box = pin.getBoundingClientRect();
      const distance = Math.hypot(event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2);
      pin.classList.toggle('is-near', distance < 58);
    });
  });
  track.addEventListener('pointerleave', clearPins);
  hotspots.addEventListener('click', () => {
    const enabled = reel.classList.toggle('show-pins');
    hotspots.setAttribute('aria-pressed', String(enabled));
  });
  track.addEventListener('pointerleave', () => { if (!drag?.moved) drag = null; });
  prev.addEventListener('click', () => go(physical - 1));
  next.addEventListener('click', () => go(physical + 1));
  track.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    go(event.key === 'Home' ? buffer : event.key === 'End' ? buffer + looks.length - 1 : physical + (event.key === 'ArrowRight' ? 1 : -1));
  });
  track.addEventListener('click', (event) => {
    if (suppressClick) return;
    const pin = event.target.closest('[data-piece]');
    if (pin) {
      panel.querySelector('[data-line="' + pin.dataset.piece + '"]')?.focus();
      return;
    }
    const slide = event.target.closest('.fit-reel__slide');
    if (slide !== slides[physical]) {
      if (slide) go(slides.indexOf(slide));
      return;
    }
    openActive();
  });
  function openActive() { inspectImage(looks[active].image, looks[active].name); }
  get('inspect').addEventListener('click', openActive);
  panel.addEventListener('change', (event) => {
    const select = event.target.closest('[data-variant]');
    if (!select) return;
    choices.set(active + ':' + select.dataset.variant, select.value);
    const line = select.closest('[data-line]');
    const { product, chosen } = lines()[Number(select.dataset.variant)];
    line.querySelector('[data-line-price]').textContent = Cart.money(chosen.price);
    const thumb = line.querySelector('img');
    const url = productThumbnail(product, chosen);
    if (thumb && url) thumb.src = url;
    totals();
  });

  async function add(selected) {
    if (pending || !selected.length || selected.some(({ chosen }) => !chosen?.available)) return;
    const source = active;
    pending = true;
    totals();
    status.textContent = 'Adding to bag…';
    try {
      await Cart.add(selected.map(({ chosen }) => ({ id: chosen.id, quantity: 1 })));
      if (source === active) status.textContent = 'Added to bag.';
    } catch (error) {
      if (source === active) status.textContent = error.message || 'Could not update the bag.';
    } finally {
      pending = false;
      totals();
    }
  }
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-piece]');
    if (button) add([lines()[Number(button.dataset.addPiece)]]);
  });
  full.addEventListener('click', () => add(lines()));
  go(buffer, true);
  updateStage();
  // Slide positions shift when the reel resizes, so hold the current look in the centre.
  new ResizeObserver(() => { go(physical, true); updateStage(); }).observe(track);
  looks.goTo = (look) => go(looks.indexOf(look) + buffer);
  return looks;
}
