/* Product cards: on hover, the card's photo is replaced by its 3D model.
   One WebGL viewer is shared and moved into whichever card is hovered. Mouse and trackpad only;
   on touch screens cards simply keep their photo. */
import * as THREE from 'three';
import { createStudio, loadModel } from './model-kit.js';

const { $$, reduce } = window.APDS;
const cards = $$('[data-card-model]');
const canHover = matchMedia('(hover:hover) and (pointer:fine)').matches;
const SPIN_SPEED = 0.7;

/* ---- the shared viewer, created on first hover ---- */
let viewer;

function createViewer() {
  const stage = document.createElement('div');
  stage.className = 'card__model';
  stage.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  stage.append(canvas);
  return { stage, studio: createStudio(canvas), yaw: 0, pointer: { x: 0, y: 0 }, tilt: { x: 0, y: 0 } };
}

let current = null, clock;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const v = viewer;
  if (!reduce) v.yaw += dt * SPIN_SPEED;
  const ease = 1 - Math.exp(-dt * 7);
  v.tilt.x += (v.pointer.x - v.tilt.x) * ease;
  v.tilt.y += (v.pointer.y - v.tilt.y) * ease;
  v.studio.turn.rotation.set(v.tilt.y * 0.3, v.yaw + v.tilt.x * 0.9, 0);
  v.studio.render();
}

async function show(card) {
  current = card;
  viewer = viewer || createViewer();
  const v = viewer;
  v.studio.renderer.setAnimationLoop(null);
  v.stage.classList.remove('is-on');
  card.querySelector('.card__media').querySelector('.card__shine').before(v.stage);

  const model = await loadModel(card.dataset.cardModel);
  if (current !== card) return; // the pointer has already moved on

  const { width, height } = v.stage.getBoundingClientRect();
  v.studio.resize(width, height);
  v.studio.show(model);
  v.yaw = 0;
  v.studio.rim.color.set(getComputedStyle(card).getPropertyValue('--accent').trim() || '#ffffff');
  clock = new THREE.Clock();
  frame(); // draw before fading in, so the card never shows an empty frame
  v.studio.renderer.setAnimationLoop(frame);
  v.stage.classList.add('is-on');
}

function hide(card) {
  if (current !== card) return;
  current = null;
  viewer?.stage.classList.remove('is-on');
  viewer?.studio.renderer.setAnimationLoop(null);
}

if (canHover) {
  cards.forEach((card) => {
    card.addEventListener('pointerenter', () => {
      show(card).catch((error) => { console.warn('[APDS] 3D model unavailable', error); hide(card); });
    });
    card.addEventListener('pointerleave', () => hide(card));
    card.addEventListener('pointermove', (e) => {
      if (!viewer || current !== card) return;
      const r = card.getBoundingClientRect();
      viewer.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      viewer.pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    }, { passive: true });
  });

  // Fetch models one at a time as their cards come into view, so the first hover is instant.
  if (!navigator.connection?.saveData) {
    let queue = Promise.resolve();
    const observer = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach(({ target }) => {
        observer.unobserve(target);
        queue = queue.then(() => loadModel(target.dataset.cardModel)).catch(() => {});
      });
    }, { rootMargin: '300px' });
    cards.forEach((card) => observer.observe(card));
  }
}
