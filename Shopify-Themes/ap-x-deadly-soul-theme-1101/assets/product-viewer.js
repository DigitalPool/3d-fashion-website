/* Product page: 3D viewer in the media stage. Drag or arrow keys rotate, the buttons zoom,
   and choosing a colour swaps the model. */
import * as THREE from 'three';
import { createStudio, loadModel } from './model-kit.js';

const { $, $$, reduce } = window.APDS;
const stage = $('[data-pdp-stage]');
const box = $('[data-pdp-model]', stage);
const thumb3d = $('[data-thumb-3d]');
const thumbs = $$('[data-thumb]');
const note = $('[data-pdp-note]', stage);
const hint = $('[data-pdp-hint]', box);
const form = JSON.parse($('[data-product-form] script[type="application/json"]').textContent);
const models = JSON.parse($('[data-pdp-models]', box).textContent);

const ZOOM_MIN = 1, ZOOM_MAX = 2.4, ZOOM_STEP = 1.25;
const SPIN_SPEED = 0.35;
const colourIndex = form.options.findIndex((option) => /colou?r/i.test(option));

function modelUrlFor(variant) {
  const colour = colourIndex < 0 ? '' : String(variant?.[`option${colourIndex + 1}`] || '').trim().toLowerCase();
  return models.colours?.[colour] || models.default;
}

function setNote(text) {
  note.textContent = text || '';
  note.hidden = !text;
}

const studio = createStudio($('canvas', box));
const baseZ = studio.camera.position.z;
let yaw = 0, pitch = 0, velocity = 0, zoom = 1, zoomGoal = 1;
let touched = false, dragging = false, lastX = 0, lastY = 0, onScreen = true, shown = false, revision = 0;
const clock = new THREE.Clock();

function fitToBox() {
  const { width, height } = box.getBoundingClientRect();
  if (width && height) studio.resize(width, height);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!shown || !onScreen) return;
  if (!dragging) {
    yaw += velocity;
    velocity *= Math.exp(-dt * 4);
    if (!touched && !reduce) yaw += dt * SPIN_SPEED;
  }
  zoom += (zoomGoal - zoom) * (1 - Math.exp(-dt * 10));
  studio.camera.position.z = baseZ / zoom;
  studio.turn.rotation.set(pitch, yaw, 0);
  studio.render();
}

/* ---- switching between the 3D view and the photos ---- */
function show3d() {
  shown = true;
  stage.classList.add('is-3d');
  thumbs.forEach((t) => t.classList.remove('is-active'));
  thumb3d.classList.add('is-active');
  setNote('');
  fitToBox();
}
function hide3d() {
  shown = false;
  stage.classList.remove('is-3d');
  thumb3d.classList.remove('is-active');
}

async function loadInto(url) {
  const mine = ++revision;
  const model = await loadModel(url);
  if (mine !== revision) return false; // a newer colour was chosen meanwhile
  fitToBox();
  studio.show(model);
  return true;
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
  loadInto(url).then((done) => {
    if (!done) return;
    box.classList.remove('is-loading');
    show3d();
  }).catch(giveUp);
});

/* ---- rotate ---- */
const interacted = () => { touched = true; hint.classList.add('is-gone'); };
box.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  velocity = 0;
  box.setPointerCapture(e.pointerId);
  box.classList.add('is-dragging');
  interacted();
});
box.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  velocity = (e.clientX - lastX) * 0.011;
  yaw += velocity;
  pitch = Math.max(-0.6, Math.min(0.6, pitch + (e.clientY - lastY) * 0.006));
  lastX = e.clientX;
  lastY = e.clientY;
});
const endDrag = () => { dragging = false; box.classList.remove('is-dragging'); };
box.addEventListener('pointerup', endDrag);
box.addEventListener('pointercancel', endDrag);
box.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: [-0.3, 0], ArrowRight: [0.3, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
  if (!step || e.target.closest('button')) return;
  e.preventDefault();
  yaw += step[0];
  pitch = Math.max(-0.6, Math.min(0.6, pitch + step[1]));
  interacted();
});

/* ---- zoom and reset ---- */
box.addEventListener('click', (e) => {
  const action = e.target.closest('[data-pdp-zoom]')?.dataset.pdpZoom;
  if (!action) return;
  interacted();
  if (action === 'in') zoomGoal = Math.min(ZOOM_MAX, zoomGoal * ZOOM_STEP);
  if (action === 'out') zoomGoal = Math.max(ZOOM_MIN, zoomGoal / ZOOM_STEP);
  if (action === 'reset') { zoomGoal = 1; yaw = 0; pitch = 0; velocity = 0; }
});

/* ---- start ---- */
studio.rim.color.set(getComputedStyle(stage).getPropertyValue('--accent').trim() || '#ffffff');
new ResizeObserver(fitToBox).observe(box);
new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }).observe(box);
const startVariant = form.variants.find((v) => v.id === form.selected) || form.variants[0];
const startUrl = modelUrlFor(startVariant);
box.dataset.url = startUrl;
loadInto(startUrl).then(() => {
  studio.renderer.setAnimationLoop(frame);
  if (thumb3d.classList.contains('is-active')) show3d(); // unless a photo was chosen while it loaded
}).catch(giveUp);
