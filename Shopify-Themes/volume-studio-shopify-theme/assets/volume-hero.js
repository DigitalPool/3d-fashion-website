/* Volume hero: product picker (swaps the 3D model and the text), sizes, add to bag, next items, header state */
const { $, $$, Cart, reduce } = window.APDS;
const root = $('[data-vh]');

/* ---- product picker ---- */
const pickers = $$('[data-vh-select]', root);
const items = $$('[data-vh-item]', root);
pickers.forEach((picker) => picker.addEventListener('click', () => {
  if (picker.getAttribute('aria-pressed') === 'true') return;
  pickers.forEach((other) => other.setAttribute('aria-pressed', String(other === picker)));
  items.forEach((item) => {
    item.hidden = item.dataset.vhItem !== picker.dataset.vhSelect;
    if (!item.hidden && !reduce) { // restart the entrance animation
      item.classList.remove('is-entering');
      void item.offsetWidth;
      item.classList.add('is-entering');
    }
  });
  window.APDS.hoodie?.setModel(picker.dataset.model, parseFloat(picker.dataset.scale) || 1, picker.dataset.title);
}));

// Fetch the other models once the page has settled, so the first switch is quick.
addEventListener('load', () => setTimeout(() => {
  pickers.forEach((picker) => window.APDS.hoodie?.preload(picker.dataset.model));
}, 1500));

/* ---- each product's size choice and add to bag ---- */
$$('.vh__buy', root).forEach((buy) => {
  const add = $('[data-vh-add]', buy);
  const status = $('[data-vh-status]', buy);
  const price = $('[data-vh-price]', buy);
  const sizes = $$('[data-vh-variant]', buy);
  sizes.forEach((button) => button.addEventListener('click', () => {
    sizes.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    add.dataset.variant = button.dataset.vhVariant;
    price.textContent = button.dataset.price;
    add.disabled = false;
  }));
  add.addEventListener('click', async () => {
    add.disabled = true;
    status.textContent = '';
    try {
      await Cart.add(Number(add.dataset.variant), 1);
    } catch (error) {
      status.textContent = error.message || 'Could not add to bag.';
    }
    add.disabled = false;
  });
});

/* ---- next items ---- */
const next = $('[data-vh-next]', root);
if (next) {
  const track = $('[data-vh-next-track]', next);
  const count = $('[data-vh-next-count]', next);
  const prevButton = $('[data-vh-next-prev]', next);
  const nextButton = $('[data-vh-next-next]', next);
  const pad = (n) => String(n).padStart(2, '0');
  const step = () => {
    const [first, second] = track.children;
    return second ? second.offsetLeft - first.offsetLeft : track.clientWidth;
  };
  const sync = () => {
    const position = Math.round(track.scrollLeft / Math.max(1, step())) + 1;
    count.textContent = `${pad(position)} / ${pad(track.children.length)}`;
    prevButton.disabled = track.scrollLeft <= 1;
    nextButton.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
  };
  const move = (direction) => track.scrollBy({ left: direction * step(), behavior: reduce ? 'auto' : 'smooth' });
  prevButton.addEventListener('click', () => move(-1));
  nextButton.addEventListener('click', () => move(1));
  track.addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', sync);
  sync();
}

/* ---- the header is see-through over the orange, then solid past it ---- */
new IntersectionObserver(([entry]) => {
  document.body.classList.toggle('is-past-hero', !entry.isIntersecting);
}, { rootMargin: '-72px 0px 0px 0px' }).observe(root);
