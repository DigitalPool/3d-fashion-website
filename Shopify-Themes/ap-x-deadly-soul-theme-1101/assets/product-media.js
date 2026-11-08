import { inspectImage } from './image-inspect.js';

const supplied = [
  ['where-is-my-money-tee', /where.*my money/, 'Where Da F**k Is My Money Tee'],
  ['mugshot-tee', /mugshot/, 'Deadly Soul Mugshot Tee'],
  ['butterfly-bowling-bag', /butterfly.*bowling/, 'Deadly Soul Butterfly Bowling Bag'],
  ['ap-belt', /^(a\/p |alwayspaid |apsht )?belt$/, 'AlwaysPaid Belt'],
  ['ap-knit-balaclava', /balaclava/, 'AlwaysPaid Knit Balaclava'],
  ['apsht-cropped-set', /cropped hoodie set|apsht.*cropped.*set/, 'APSHT Cropped Hoodie Set'],
  ['soul-messenger-bag', /messenger bag/, 'Deadly Soul Messenger Bag'],
  ['apsht-windbreaker-set', /windbreaker/, 'APSHT Windbreaker Set'],
  ['apsht-hoodie-tracksuit', /hoodie tracksuit/, 'APSHT Hoodie Tracksuit'],
];

function suppliedEntry(p) {
  return supplied.find(([handle, title]) => p.handle === handle || title.test(p.title.toLowerCase()));
}

export function productKey(product) { return suppliedEntry(product)?.[0]; }

export function suppliedPhoto(p) {
  const entry = suppliedEntry(p);
  if (!entry) return null;
  const [handle, , label] = entry;
  const src = handle === 'apsht-cropped-set' ? window.SHOP?.setCutout || window.SHOP?.productPhotos?.[handle] : window.SHOP?.productPhotos?.[handle];
  return src ? { src, label, model: handle === 'apsht-cropped-set' } : null;
}

function generatedView(product, variant, colorIndex) {
  const key = productKey(product);
  const views = window.SHOP?.modelPhotos?.[key];
  if (!views) return null;
  const color = colorIndex < 0 || !variant ? 'default' : variant.options?.[colorIndex]?.trim().toLowerCase();
  const src = views[color];
  return src ? { src, label: product.title, model: true, generated: true } : null;
}

export function suppliedGallery() {
  return supplied.map(([handle, , title]) => productViews({ handle, title })[0]).filter(Boolean);
}

export function productThumbnail(product, variant) {
  const key = productKey(product);
  const colorIndex = (product.options || []).findIndex((option) => /colou?r|shade|finish/i.test(option));
  const pictured = key === 'mugshot-tee' ? 'white' : key === 'butterfly-bowling-bag' ? 'pink' : 'black';
  const selected = colorIndex < 0 ? pictured : variant?.options?.[colorIndex]?.trim().toLowerCase();
  const mockup = !variant || selected === pictured ? product.mockup : '';
  return mockup || variant?.image || window.SHOP?.productPhotos?.[key] || product.thumb || '';

}

/* Products with a supplied photo set show every photo: all colours, model shots and product shots. */
function everyPhoto(product, variant, colorIndex) {
  const looks = window.SHOP?.lookPhotos?.[productKey(product)];
  if (!looks) return [];
  const chosen = colorIndex < 0 || !variant ? '' : String(variant.options?.[colorIndex] || '').trim().toLowerCase();
  const ordered = [...looks].sort((a, b) => Number(b.color === chosen) - Number(a.color === chosen));
  return [
    ...ordered.map((look) => ({ src: look.src, label: `${product.title} · ${look.label}`, model: true, generated: true })),
    ...(product.photos || []).filter((photo) => photo.src).map((photo) => ({ src: photo.src, label: photo.label || product.title })),
  ];
}

export function productViews(product, variant) {
  const fallback = suppliedPhoto(product);
  const image = variant?.image;
  const photos = (product.photos || []).filter((photo) => photo.src);
  const variantImages = new Set((product.variants || []).filter((v) => v.image && v.image !== image).map((v) => v.image));
  const eligible = photos.filter((photo) => !variantImages.has(photo.src) || !variant);
  const variantPhoto = eligible.find((photo) => photo.src === image);
  const colorIndex = (product.options || []).findIndex((option) => /colou?r|shade|finish/i.test(option));
  const singleColor = colorIndex < 0 || new Set((product.variants || []).map((v) => v.options?.[colorIndex])).size < 2;
  const onModel = eligible.filter((photo) => photo.model && (!variant || photo.src === image || singleColor));
  const bundledModel = fallback?.model && (!variant || singleColor);
  const entries = [
    ...onModel,
    bundledModel ? fallback : null,
    generatedView(product, variant, colorIndex),
    image ? (variantPhoto || { src: image, label: product.title }) : fallback,
    fallback && (!image || !fallback.model) ? fallback : null,
    ...eligible.filter((photo) => !photo.model),
    ...everyPhoto(product, variant, colorIndex),
  ];
  return entries.filter((entry, index) => entry?.src && entries.findIndex((other) => other?.src === entry.src) === index)
    .map((entry) => ({ ...entry, label: entry.label || product.title }));
}

export function createPhotoStage(root) {
  const frame = root.querySelector('[data-photo-frame]');
  const nav = root.querySelector('[data-photo-nav]');
  const caption = root.querySelector('[data-photo-caption]');
  const inspect = root.querySelector('[data-photo-inspect]');
  function openCurrent() {
    const entry = entries[index];
    if (entry?.src && !entry.video) inspectImage(entry.src, entry.label);
  }
  inspect.addEventListener('click', openCurrent);
  let entries = [], index = 0;
  function paint() {
    const entry = entries[index];
    inspect.hidden = !entry?.src || Boolean(entry.video);
    frame.classList.toggle('is-cutout', !entry?.video && /(?:^|\/)cutout-[^/?]+\.png(?:\?|$)/i.test(entry?.src || ''));
    let trigger;
    const media = entry && document.createElement(entry.video ? 'video' : 'img');
    if (media) {
      if (entry.video) {
        media.controls = true;
        media.playsInline = true;
        media.preload = 'metadata';
        if (entry.src) media.poster = entry.src;
        media.setAttribute('aria-label', entry.label);
      } else {
        media.alt = entry.label;
        media.draggable = false;
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'photo-stage__zoom-target';
        trigger.setAttribute('aria-label', 'Zoom in on ' + entry.label);
        trigger.append(media);
        trigger.addEventListener('click', openCurrent);
        media.addEventListener('load', () => {
          if (media.naturalHeight) trigger.style.aspectRatio = media.naturalWidth + ' / ' + media.naturalHeight;
        });
      }
      media.addEventListener('error', () => {
        if (!media.isConnected) return;
        inspect.hidden = true;
        frame.textContent = 'Photo or video unavailable. Choose another view.';
      });
      media.src = entry.video || entry.src;
      frame.replaceChildren(trigger || media);
    } else {
      frame.textContent = root.dataset.photoEmpty || 'Photography coming soon.';
    }
    caption.textContent = !entry ? '' : entry.generated ? entry.label : (entry.video ? 'Look video' : entry.model ? 'On model' : 'Product photo') + ' · ' + entry.label;
    [...nav.children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  return {
    show(next, { reset = false, preferred } = {}) {
      const current = entries[index];
      entries = next;
      index = Math.max(0, entries.findIndex((entry) => preferred ? !entry.video && entry.src === preferred :
        !reset && current && entry.src === current.src && entry.video === current.video));
      nav.replaceChildren(...entries.map((entry, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        if (entry.src) {
          const thumbnail = document.createElement('img');
          thumbnail.src = entry.src;
          thumbnail.alt = '';
          thumbnail.loading = 'lazy';
          button.append(thumbnail);
        } else {
          button.textContent = 'Video';
        }
        button.title = entry.label;
        button.setAttribute('aria-label', entry.label + (entry.video ? ' video' : ' photo ' + (i + 1)));
        button.addEventListener('click', () => { index = i; paint(); });
        return button;
      }));
      nav.hidden = entries.length < 2;
      paint();
    },
    image() { return frame.querySelector('img'); },
  };
}
