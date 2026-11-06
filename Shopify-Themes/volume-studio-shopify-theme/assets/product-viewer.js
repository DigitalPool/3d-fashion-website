/* Product page: 3D viewer in the media stage. Choosing a colour swaps the model. */
import { createModelViewer } from './model-viewer.js';

const { $, $$ } = window.APDS;
const stage = $('[data-pdp-stage]');
const box = $('[data-pdp-model]', stage);
const thumb3d = $('[data-thumb-3d]');
const thumbs = $$('[data-thumb]');
const note = $('[data-pdp-note]', stage);
const form = JSON.parse($('[data-product-form] script[type="application/json"]').textContent);
const models = JSON.parse($('[data-pdp-models]', box).textContent);
const colourIndex = form.options.findIndex((option) => /colou?r/i.test(option));
const viewer = createModelViewer(box);

function modelUrlFor(variant) {
  const colour = colourIndex < 0 ? '' : String(variant?.[`option${colourIndex + 1}`] || '').trim().toLowerCase();
  return models.colours?.[colour] || models.default;
}
function setNote(text) {
  note.textContent = text || '';
  note.hidden = !text;
}
function show3d() {
  viewer.setShown(true);
  stage.classList.add('is-3d');
  thumbs.forEach((t) => t.classList.remove('is-active'));
  thumb3d.classList.add('is-active');
  setNote('');
}
function hide3d() {
  viewer.setShown(false);
  stage.classList.remove('is-3d');
  thumb3d.classList.remove('is-active');
}
function giveUp(error) {
  console.warn('[APDS] 3D viewer unavailable', error);
  hide3d();
  thumb3d.remove();
  thumbs[0]?.classList.add('is-active');
}

thumb3d.addEventListener('click', show3d);
thumbs.forEach((t) => t.addEventListener('click', () => {
  hide3d();
  setNote(t.dataset.note);
}));

document.addEventListener('pdp:variant', ({ detail: variant }) => {
  if (colourIndex < 0 || !variant) return;
  const url = modelUrlFor(variant);
  if (url === box.dataset.url) return;
  box.dataset.url = url;
  box.classList.add('is-loading');
  viewer.setModel(url, { keepAngle: true }).then((done) => {
    if (!done) return;
    box.classList.remove('is-loading');
    show3d();
  }).catch(giveUp);
});

const startVariant = form.variants.find((v) => v.id === form.selected) || form.variants[0];
const startUrl = modelUrlFor(startVariant);
box.dataset.url = startUrl;
viewer.setModel(startUrl).then(() => {
  if (thumb3d.classList.contains('is-active')) show3d(); // unless a photo was chosen while it loaded
}).catch(giveUp);
