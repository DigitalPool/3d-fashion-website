/* A 3D model in a box: drag or arrow keys rotate, optional buttons zoom, slow spin until touched.
   Used by the product page, the collection stage and the models around the site. */
import * as THREE from 'three';
import { createStudio, loadModel } from './model-kit.js';

const { $, reduce } = window.APDS;
const ZOOM_MIN = 1, ZOOM_MAX = 2.4, ZOOM_STEP = 1.25;

export function createModelViewer(box, { spin = 0.35 } = {}) {
  const studio = createStudio($('canvas', box));
  const hint = $('[data-model-hint]', box);
  const baseZ = studio.camera.position.z;
  const clock = new THREE.Clock();
  let yaw = 0, pitch = 0, velocity = 0, zoom = 1, zoomGoal = 1;
  let touched = false, dragging = false, lastX = 0, lastY = 0;
  let onScreen = true, shown = true, revision = 0;

  const fit = () => {
    const { width, height } = box.getBoundingClientRect();
    if (width && height) studio.resize(width, height);
  };
  const interacted = () => { touched = true; hint?.classList.add('is-gone'); };
  const limit = (value) => Math.max(-0.6, Math.min(0.6, value));

  studio.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!shown || !onScreen) return;
    if (!dragging) {
      yaw += velocity;
      velocity *= Math.exp(-dt * 4);
      if (!touched && !reduce) yaw += dt * spin;
    }
    zoom += (zoomGoal - zoom) * (1 - Math.exp(-dt * 10));
    studio.camera.position.z = baseZ / zoom;
    studio.turn.rotation.set(pitch, yaw, 0);
    studio.render();
  });

  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button,a')) return;
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
    pitch = limit(pitch + (e.clientY - lastY) * 0.006);
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const endDrag = () => { dragging = false; box.classList.remove('is-dragging'); };
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);
  box.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: [-0.3, 0], ArrowRight: [0.3, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
    if (!step || e.target.closest('button,a')) return;
    e.preventDefault();
    yaw += step[0];
    pitch = limit(pitch + step[1]);
    interacted();
  });
  box.addEventListener('click', (e) => {
    const action = e.target.closest('[data-model-zoom]')?.dataset.modelZoom;
    if (!action) return;
    interacted();
    if (action === 'in') zoomGoal = Math.min(ZOOM_MAX, zoomGoal * ZOOM_STEP);
    if (action === 'out') zoomGoal = Math.max(ZOOM_MIN, zoomGoal / ZOOM_STEP);
    if (action === 'reset') { zoomGoal = 1; yaw = 0; pitch = 0; velocity = 0; }
  });

  new ResizeObserver(fit).observe(box);
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }).observe(box);

  return {
    studio,
    fit,
    setShown(value) { shown = value; if (value) fit(); },
    /* Resolves true once showing; false if a newer model was asked for meanwhile. */
    async setModel(url, { keepAngle = false } = {}) {
      const mine = ++revision;
      const model = await loadModel(url);
      if (mine !== revision) return false;
      fit();
      studio.show(model.clone()); // a copy, as a product card on the page may show the same model
      if (!keepAngle) { yaw = 0; pitch = 0; velocity = 0; }
      return true;
    },
  };
}
