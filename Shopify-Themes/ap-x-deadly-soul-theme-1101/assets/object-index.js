/* Object index: previous and next buttons for the one-line product carousel */
const { $ } = window.APDS;
const root = $('[data-oi]');
const track = $('[data-oi-track]', root);
const nav = $('[data-oi-nav]', root);
const prev = $('[data-oi-prev]', root);
const next = $('[data-oi-next]', root);

const step = () => {
  const [first, second] = track.children;
  return second ? second.offsetLeft - first.offsetLeft : track.clientWidth;
};
const sync = () => {
  const max = track.scrollWidth - track.clientWidth;
  nav.hidden = max <= 1;
  prev.disabled = track.scrollLeft <= 1;
  next.disabled = track.scrollLeft >= max - 1;
};
const move = (direction) => {
  track.scrollBy({ left: direction * step(), behavior: window.APDS.reduce ? 'auto' : 'smooth' });
};

prev.addEventListener('click', () => move(-1));
next.addEventListener('click', () => move(1));
track.addEventListener('scroll', sync, { passive: true });
addEventListener('resize', sync);
sync();
