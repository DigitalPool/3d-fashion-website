/* Floating 3D hoodie: one fixed WebGL layer that flies between [data-hoodie-slot] elements as the page
   scrolls. Faces whichever side the pointer (or arrow keys) moves to, and can be dragged to rotate. */
import * as THREE from 'three';
import { loadModel } from './model-kit.js';
import { RoomEnvironment } from './room-environment.js';

const { $, $$, reduce } = window.APDS;
const rig = $('[data-hoodie]');
const canvas = $('.hoodie__gl', rig);
const hit = $('[data-hoodie-hit]', rig);
const hint = $('[data-hoodie-hint]', rig);

const FOV = 20;
const FACE_POINTER = { yaw: 0.75, pitch: 0.18 };
const smooth = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const mix = (a, b, k) => a + (b - a) * k;
const css = (name, fallback) => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

// Slots in page order, each paired with the section whose arrival starts the flight towards it.
const slots = $$('[data-hoodie-slot]').map((el) => ({
  el,
  section: el.closest('section') || el,
  yaw: parseFloat(el.dataset.hoodieYaw) || 0,
}));

let aspect = 0.93; // width / height, replaced by the real value once the model loads
let modelScale = 1;

function waypoint() {
  const vh = innerHeight;
  const point = { x: innerWidth / 2, y: vh / 2, h: 0, yaw: 0, spin: 0 };
  slots.forEach((slot, i) => {
    const r = slot.el.getBoundingClientRect();
    const here = { x: r.left + r.width / 2, y: r.top + r.height / 2, h: Math.min(r.height, r.width / aspect) * modelScale };
    const top = slot.section.getBoundingClientRect().top;
    const k = i === 0 ? 1 : smooth((vh - top) / (vh * 0.8));
    point.x = mix(point.x, here.x, k);
    point.y = mix(point.y, here.y, k);
    point.h = mix(point.h, here.h, k);
    point.yaw = mix(point.yaw, slot.yaw, k);
    if (i > 0 && !reduce) point.spin += k * Math.PI * 2; // one full turn per flight
  });
  return point;
}

function start(firstModel, renderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.2, 0.6, 1);
  const rimAp = new THREE.DirectionalLight(css('--ap', '#e3122c'), 0);
  rimAp.position.set(-1, 0.3, 0.25);
  const rimDs = new THREE.DirectionalLight(css('--ds', '#ff4fa0'), 0);
  rimDs.position.set(1, 0.3, 0.25);
  scene.add(key, rimAp, rimDs);

  // anchor (screen position and size) > turn (rotation) > model
  const turn = new THREE.Group();
  const anchor = new THREE.Group();
  anchor.add(turn);
  scene.add(anchor);
  let size;
  const mount = (model) => {
    // A copy, because the product card hover can show this same model at the same time.
    const copy = model.clone();
    size = model.userData.size;
    aspect = size.x / size.y;
    turn.clear();
    turn.add(copy);
  };
  mount(firstModel);

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0, (h / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  /* ---- input ---- */
  const touchOnly = !matchMedia('(hover:hover) and (pointer:fine)').matches;
  const pointer = { x: 0, y: 0 };
  let dragging = false, lastX = 0, lastY = 0, userYaw = 0, userPitch = 0, velocity = 0, lastInteraction = -Infinity, turnGoal = null;
  let swapRevision = 0;
  const faceFront = () => { // takes the short way round
    turnGoal = Math.PI * 2 * Math.round(userYaw / (Math.PI * 2));
    velocity = 0;
    userPitch = 0;
    lastInteraction = performance.now() + 3000;
  };
  window.APDS.hoodie = {
    preload: (url) => loadModel(url).catch(() => {}),
    async setModel(url, scale, title) {
      const mine = ++swapRevision;
      rig.classList.add('is-swapping');
      try {
        const model = await loadModel(url);
        if (mine !== swapRevision) return; // a newer choice was made meanwhile
        mount(model);
        modelScale = scale;
        faceFront();
        hit.setAttribute('aria-label', `3D model of ${title}. Drag, or use the left and right arrow keys, to rotate it.`);
      } catch (error) {
        console.warn('[APDS] 3D model unavailable', error);
      }
      if (mine === swapRevision) rig.classList.remove('is-swapping');
    },
  };

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.target.closest?.('input,select,textarea,[contenteditable]')) return;
    pointer.x = e.key === 'ArrowLeft' ? -0.9 : 0.9;
    pointer.y = 0;
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    lastInteraction = performance.now();
    hit.classList.remove('is-dragging');
  };
  hit.addEventListener('pointerdown', (e) => {
    dragging = true;
    turnGoal = null;
    lastX = e.clientX;
    lastY = e.clientY;
    velocity = 0;
    hit.setPointerCapture(e.pointerId);
    hit.classList.add('is-dragging');
    hint.classList.add('is-gone');
  });
  hit.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    userYaw += dx * 0.011;
    velocity = dx * 0.011;
    userPitch = Math.max(-0.6, Math.min(0.6, userPitch + dy * 0.006));
  });
  hit.addEventListener('pointerup', endDrag);
  hit.addEventListener('pointercancel', endDrag);
  hit.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation(); // rotates the hoodie instead of choosing a side
    userYaw += e.key === 'ArrowLeft' ? -0.3 : 0.3;
    lastInteraction = performance.now();
    hint.classList.add('is-gone');
  });

  /* ---- frame loop ---- */
  const state = { ...waypoint(), faceYaw: 0, facePitch: 0, side: 0 };
  const clock = new THREE.Clock();
  let time = 0;
  hit.hidden = false;
  rig.classList.add('is-ready');

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    const follow = reduce ? 1 : 1 - Math.exp(-dt * 9);
    const face = 1 - Math.exp(-dt * 5);
    const goal = waypoint();
    state.x = mix(state.x, goal.x, follow);
    state.y = mix(state.y, goal.y, follow);
    state.h = mix(state.h, goal.h, follow);
    state.yaw = mix(state.yaw, goal.yaw, follow);
    state.spin = mix(state.spin, goal.spin, follow);
    state.faceYaw = mix(state.faceYaw, pointer.x * FACE_POINTER.yaw, face);
    state.facePitch = mix(state.facePitch, pointer.y * FACE_POINTER.pitch, face);
    state.side = mix(state.side, pointer.x, face);

    if (turnGoal !== null) {
      userYaw = mix(userYaw, turnGoal, face);
      if (Math.abs(turnGoal - userYaw) < 0.002) turnGoal = null;
    }
    if (!dragging) {
      userYaw += velocity;
      velocity *= Math.exp(-dt * 4);
      if (touchOnly && !reduce && performance.now() - lastInteraction > 2500) userYaw += dt * 0.45;
    }

    const bob = reduce ? 0 : Math.sin(time * 1.1) * state.h * 0.012;
    const px = state.x, py = state.y + bob;
    anchor.position.set(px - innerWidth / 2, innerHeight / 2 - py, 0);
    anchor.scale.setScalar(state.h / size.y);
    turn.rotation.set(state.facePitch + userPitch, state.yaw + state.spin + state.faceYaw + userYaw, 0);
    rimAp.intensity = 0.25 + Math.max(0, -state.side) * 1.5;
    rimDs.intensity = 0.25 + Math.max(0, state.side) * 1.5;

    const w = state.h * aspect;
    hit.style.width = `${w}px`;
    hit.style.height = `${state.h}px`;
    hit.style.transform = `translate3d(${px - w / 2}px,${py - state.h / 2}px,0)`;

    anchor.visible = py + state.h / 2 > 0 && py - state.h / 2 < innerHeight;
    if (anchor.visible) renderer.render(scene, camera);
    else renderer.clear();
  });
}

function giveUp(reason) {
  console.warn('[APDS] 3D hoodie unavailable', reason);
  rig.remove();
}

if (!slots.length) {
  rig.remove();
} else {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    loadModel(rig.dataset.model).then((model) => start(model, renderer)).catch(giveUp);
  } catch (error) {
    giveUp(error);
  }
}
