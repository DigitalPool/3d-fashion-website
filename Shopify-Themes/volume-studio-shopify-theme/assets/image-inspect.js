let viewer;

export function inspectImage(src, label) {
  if (!viewer) viewer = createViewer();
  viewer.open(src, label);
}

function createViewer() {
  const dialog = document.createElement('dialog');
  dialog.className = 'image-inspector';
  dialog.setAttribute('aria-label', 'Image viewer');
  dialog.innerHTML = `
    <header><strong></strong><button type="button" data-close aria-label="Close viewer">✕</button></header>
    <div class="image-inspector__view" tabindex="0" aria-label="Image. Drag or use arrow keys when zoomed."><img alt="" draggable="false"></div>
    <footer>
      <button type="button" data-zoom-out aria-label="Zoom out">−</button>
      <output aria-live="polite">100%</output>
      <button type="button" data-zoom-in aria-label="Zoom in">+</button>
      <button type="button" data-reset>Fit to view</button>
    </footer>`;
  document.body.append(dialog);
  const get = (selector) => dialog.querySelector(selector);
  const view = get('.image-inspector__view'), image = get('img');
  const out = get('[data-zoom-out]'), zoomIn = get('[data-zoom-in]');
  let scale = 1, x = 0, y = 0, drag, moved = false;
  function paint() {
    const maxX = Math.max(0, (image.offsetWidth * scale - view.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - view.clientHeight) / 2);
    x = Math.max(-maxX, Math.min(x, maxX));
    y = Math.max(-maxY, Math.min(y, maxY));
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    get('output').textContent = Math.round(scale * 100) + '%';
    view.classList.toggle('is-zoomed', scale > 1);
    out.disabled = scale <= 1;
    zoomIn.disabled = scale >= 3;
  }
  function zoom(amount, event) {
    const next = Math.max(1, Math.min(3, scale + amount));
    if (event) {
      const box = view.getBoundingClientRect();
      const px = event.clientX - box.left - box.width / 2;
      const py = event.clientY - box.top - box.height / 2;
      x = px - (px - x) * next / scale;
      y = py - (py - y) * next / scale;
    }
    scale = next;
    paint();
  }
  function reset() { scale = 1; x = 0; y = 0; paint(); }
  out.addEventListener('click', () => zoom(-.25));
  zoomIn.addEventListener('click', () => zoom(.25));
  get('[data-reset]').addEventListener('click', reset);
  get('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  image.addEventListener('load', paint);
  view.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom(event.deltaY < 0 ? .15 : -.15, event);
  }, { passive: false });
  view.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    moved = false;
    if (scale <= 1) return;
    drag = { id: event.pointerId, x: event.clientX - x, y: event.clientY - y };
    view.setPointerCapture(event.pointerId);
  });
  view.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    const nextX = event.clientX - drag.x, nextY = event.clientY - drag.y;
    if (Math.abs(nextX - x) + Math.abs(nextY - y) > 3) moved = true;
    x = nextX;
    y = nextY;
    paint();
  });
  view.addEventListener('click', (event) => {
    if (!moved && scale === 1) zoom(.75, event);
  });
  view.addEventListener('lostpointercapture', () => { drag = null; });
  view.addEventListener('keydown', (event) => {
    const deltas = { ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 35], ArrowDown: [0, -35] };
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault();
      zoom(event.key === '-' ? -.25 : .25);
      return;
    }
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    x += delta[0]; y += delta[1]; paint();
  });
  return {
    open(src, label) {
      image.src = src;
      image.alt = label;
      get('strong').textContent = label;
      dialog.showModal();
      moved = false;
      reset();
    },
  };
}
