import { productViews, suppliedGallery } from './product-media.js';

const { $, Sound } = window.APDS;
const root = $('[data-gallery]');
const data = JSON.parse($('[data-gallery-json]', root).textContent);
const grid = $('[data-gallery-grid]', root);
const dialog = $('[data-lightbox]');
const fullImage = $('img', dialog);
const shop = $('[data-lb-link]', dialog);
const products = data.products.flatMap((product) => {
  const entries = productViews(product);
  const primary = entries[0];
  if (!primary) return [];
  const photos = [primary, ...entries.slice(1).filter((photo) => photo.model || photo.gallery)];
  return photos.map((photo) => ({ ...photo, title: product.title, url: product.url }));
});
const items = data.looks.length ? [...data.looks, ...products.filter((photo) => photo.model || photo.gallery)] :
  products.length ? products : suppliedGallery();
const seen = new Set();
const reveal = window.APDS.reduce ? null : new IntersectionObserver((entries) => {
  entries.forEach(({ target, isIntersecting }) => {
    if (!isIntersecting) return;
    target.classList.add('is-entering');
    reveal.unobserve(target);
  });
}, { threshold: .12 });

items.sort((a, b) => Number(Boolean(b.model)) - Number(Boolean(a.model)));
items.filter((entry) => {
  if (seen.has(entry.src)) return false;
  seen.add(entry.src);
  return true;
}).forEach((entry, index) => {
  const card = document.createElement('article');
  card.className = 'gallery-card';
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'View ' + entry.label);
  const image = document.createElement('img');
  image.alt = entry.label;
  image.loading = index < 3 ? 'eager' : 'lazy';
  image.src = entry.src;
  button.append(image);
  button.addEventListener('click', () => {
    fullImage.src = entry.src;
    fullImage.alt = entry.label;
    $('figcaption', dialog).textContent = entry.title || entry.label;
    shop.hidden = !entry.url;
    if (entry.url) shop.href = entry.url;
    Sound.play('select');
    dialog.showModal();
  });
  const caption = document.createElement('div');
  caption.className = 'gallery-card__caption';
  const kind = document.createElement('small');
  kind.textContent = entry.generated ? 'Lookbook' : entry.model ? 'On model' : entry.title || !data.looks.length ? 'Product photo' : 'Lookbook';
  const title = document.createElement(entry.url ? 'a' : 'span');
  title.textContent = entry.title || entry.label;
  if (entry.url) title.href = entry.url;
  caption.append(kind, title);
  card.append(button, caption);
  grid.append(card);
  card.style.setProperty('--gallery-delay', (index % 3) * 65 + 'ms');
  reveal?.observe(card);
});
$('[data-lb-close]', dialog).addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
