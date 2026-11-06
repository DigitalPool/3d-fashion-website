/* CHOOSE YOUR SIDE | full-screen WebGL versus screen */
import * as THREE from 'three';

const { $, $$, Sound, reduce } = window.APDS;
const root = $('[data-vs]');
const canvas = $('.vs__gl', root);
const sides = { ap: $('.vs__side--ap', root), ds: $('.vs__side--ds', root) };
const flash = $('.vs__flash', root);
const timerEl = $('[data-vs-timer]', root);
const SHOP = window.SHOP || {};

const isVert = () => innerWidth <= 760 || innerHeight > innerWidth;

const FRAG = /* glsl */`
precision highp float;
uniform float uTime, uSplit, uVert, uHover, uFlash;
uniform vec2 uRes, uMouse;
uniform vec3 uColA, uColB, uColB2;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }

vec3 apSide(vec2 uv, vec2 p){
  float t = uTime*.06;
  float warp = fbm(p*2.4 - t*1.3);
  float smoke = fbm(p*1.5 + vec2(t*2., -t*3.) + warp*1.3);
  vec3 col = vec3(.018,.01,.012);
  col += uColA * pow(smoke, 3.2) * 1.25;
  col += vec3(1.,.55,.5) * pow(smoke, 8.) * .9;
  // spray-paint drips falling from the top edge
  float cols = 22.;
  float cx = floor(p.x*cols);
  float w = fract(p.x*cols);
  float on = step(.5, hash(vec2(cx, 7.)));
  float len = (hash(vec2(cx,3.))*.45 + .06) * (.85 + .15*sin(uTime*.35 + cx));
  float yy = 1. - uv.y;
  float body = smoothstep(.36,.18, abs(w-.5)) * step(yy, len);
  float bulb = smoothstep(.06, .0, length(vec2((w-.5)/cols*1.6, yy-len)));
  col += uColA * (body + bulb) * on * .65;
  // spray grit
  col += step(.86, hash(floor(p*260.) + floor(uTime*9.))) * .035;
  // chrome light sweep
  float sw = fract((p.x*.7 + p.y*.45) * .5 - uTime*.045);
  col += vec3(1.) * smoothstep(.015, .0, abs(sw-.5)) * .08;
  return col;
}

vec3 dsSide(vec2 uv, vec2 p){
  float t = uTime*.05;
  float s = fbm(p*1.25 + vec2(-t*2., t*1.5) + fbm(p*2.1 - t*1.2)*1.4);
  vec3 col = mix(vec3(.025,.006,.02), uColB*.8, clamp(pow(s, 2.9)*1.35, 0., 1.));
  col += uColB2 * pow(s, 7.) * .8;
  // gothic halo rings
  vec2 c = vec2(uRes.x/uRes.y * .78, .55);
  float r = length(p - c);
  col += uColB * smoothstep(.012,.0,abs(r - .32 - .01*sin(uTime*.8))) * .25;
  col += uColB * smoothstep(.008,.0,abs(r - .46 - .015*sin(uTime*.6+1.))) * .12;
  // halftone dots
  vec2 g = fract(p*90.) - .5;
  col += uColB2 * step(length(g), .18) * pow(s, 3.) * .25;
  return col;
}

void main(){
  vec2 uv = vUv;
  float ar = uRes.x/uRes.y;
  vec2 p = vec2(uv.x*ar, uv.y);
  float axis  = uVert > .5 ? 1. - uv.y : uv.x;
  float other = uVert > .5 ? uv.x : uv.y;
  float jag = (noise(vec2(other*16., uTime*1.6)) - .5) * .03
            + step(.94, hash(vec2(floor(other*34.), floor(uTime*11.)))) * .025;
  float d = axis - (uSplit + jag);
  float band = step(.982, hash(vec2(floor(other*46.), floor(uTime*9.))));
  vec2 gp = p + vec2(band*.05, 0.);
  // chromatic split: sample each side twice with an offset for a RGB fringe
  vec3 a = apSide(uv, gp);
  vec3 b = dsSide(uv, gp);
  float ca = .004 + band*.02;
  vec3 a2 = apSide(uv, gp + vec2(ca, 0.));
  vec3 b2 = dsSide(uv, gp - vec2(ca, 0.));
  a = vec3(a.r, mix(a.g, a2.g, .5), a2.b);
  b = vec3(b2.r, mix(b.g, b2.g, .5), b.b);
  float m = smoothstep(-.002, .002, d);
  vec3 col = mix(a, b, m);
  float dim = uHover > 0. ? (1. - m) : m;
  col *= mix(1., .45, dim * abs(uHover));
  float g = exp(-abs(d) * 110.);
  col += vec3(1.) * g * 1.1;
  col += mix(uColA, uColB, m) * exp(-abs(d) * 16.) * .4;
  vec2 mp = vec2(uMouse.x*ar, uMouse.y);
  col += .07 * exp(-length(p - mp) * 3.2);
  col *= .9 + .1 * sin(uv.y * uRes.y * 1.7);
  col *= smoothstep(1.25, .35, length(uv - .5) * 1.35);
  col = mix(col, vec3(1.), uFlash);
  gl_FragColor = vec4(col, 1.);
}`;

const VERT_FS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

/* butterflies (DS) */
const BF_VERT = /* glsl */`
attribute vec4 aSeed; // x, y0, phase, speed
attribute float aSize;
uniform float uTime, uAspect;
varying vec2 vUv; varying vec2 vScreen; varying float vAlpha;
void main(){
  vUv = uv;
  float t = uTime * aSeed.w;
  float y = fract(aSeed.y + t * .05);
  float x = aSeed.x + sin(t*.9 + aSeed.z*6.28) * .05;
  float flap = mix(.18, 1., abs(sin(uTime * (7. + aSeed.w*5.) + aSeed.z*20.)));
  vec2 lp = position.xy;
  lp.x *= flap;
  float rot = sin(t*.7 + aSeed.z*10.) * .4;
  lp = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * lp;
  vec2 sp = vec2(x, y) + lp * aSize * vec2(1./uAspect, 1.);
  vScreen = sp;
  vAlpha = smoothstep(0., .12, y) * smoothstep(1., .8, y);
  gl_Position = vec4(sp * 2. - 1., 0., 1.);
}`;
const BF_FRAG = /* glsl */`
uniform sampler2D uTex; uniform float uSplit, uVert; uniform vec3 uCol;
varying vec2 vUv; varying vec2 vScreen; varying float vAlpha;
void main(){
  float axis = uVert > .5 ? 1. - vScreen.y : vScreen.x;
  if (axis < uSplit + .01) discard;
  float a = texture2D(uTex, vUv).a;
  if (a < .05) discard;
  gl_FragColor = vec4(uCol, a * vAlpha * .9);
}`;

/* embers (AP) */
const EM_VERT = /* glsl */`
attribute vec4 aSeed;
uniform float uTime, uPx;
varying vec2 vScreen; varying float vA;
void main(){
  float t = uTime * aSeed.w;
  float y = fract(aSeed.y + t * .08);
  float x = aSeed.x + sin(t*1.7 + aSeed.z*30.) * .015;
  vScreen = vec2(x, y);
  vA = smoothstep(0., .2, y) * smoothstep(1., .55, y);
  gl_PointSize = (1.5 + aSeed.z * 3.5) * uPx;
  gl_Position = vec4(vec2(x, y) * 2. - 1., 0., 1.);
}`;
const EM_FRAG = /* glsl */`
uniform float uSplit, uVert; uniform vec3 uCol;
varying vec2 vScreen; varying float vA;
void main(){
  float axis = uVert > .5 ? 1. - vScreen.y : vScreen.x;
  if (axis > uSplit - .01) discard;
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, .0, d);
  gl_FragColor = vec4(mix(uCol, vec3(1.,.8,.6), a*.6), a * vA);
}`;

function cssColor(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  return new THREE.Color(v);
}

function loadMask(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 206;
      const g = c.getContext('2d');
      g.drawImage(img, 8, 8, 240, 190);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.NoColorSpace;
      resolve(tex);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    root.classList.add('vs--nogl');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const U = {
    uTime: { value: 0 }, uSplit: { value: 0.5 }, uVert: { value: isVert() ? 1 : 0 }, uHover: { value: 0 }, uFlash: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uColA: { value: cssColor('--ap', '#e3122c') }, uColB: { value: cssColor('--ds', '#ff4fa0') }, uColB2: { value: cssColor('--ds-2', '#ffc2dd') },
  };
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERT_FS, fragmentShader: FRAG, uniforms: U, depthTest: false }));
  scene.add(bg);

  // butterflies
  const mask = await loadMask(SHOP.assets?.butterfly);
  let bfMat;
  if (mask) {
    const N = innerWidth < 760 ? 16 : 30;
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 0.8));
    const seeds = new Float32Array(N * 4), sizes = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      seeds.set([Math.random(), Math.random(), Math.random(), 0.4 + Math.random() * 0.9], i * 4);
      sizes[i] = 0.025 + Math.pow(Math.random(), 2.2) * 0.07;
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    geo.instanceCount = N;
    bfMat = new THREE.ShaderMaterial({
      vertexShader: BF_VERT, fragmentShader: BF_FRAG, transparent: true, depthTest: false,
      uniforms: { uTex: { value: mask }, uTime: U.uTime, uAspect: { value: 1 }, uSplit: U.uSplit, uVert: U.uVert, uCol: { value: cssColor('--ds-2', '#ffc2dd') } },
    });
    const bf = new THREE.Mesh(geo, bfMat);
    bf.frustumCulled = false;
    scene.add(bf);
  }

  // embers
  {
    const N = 160;
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) seeds.set([Math.random(), Math.random(), Math.random(), 0.3 + Math.random()], i * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: EM_VERT, fragmentShader: EM_FRAG, transparent: true, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uPx: { value: renderer.getPixelRatio() }, uSplit: U.uSplit, uVert: U.uVert, uCol: { value: cssColor('--ap', '#e3122c') } },
    }));
    pts.frustumCulled = false;
    scene.add(pts);
  }

  const resize = () => {
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h, false);
    U.uRes.value.set(w, h);
    U.uVert.value = isVert() ? 1 : 0;
    if (bfMat) bfMat.uniforms.uAspect.value = w / h;
  };
  resize();
  addEventListener('resize', resize);

  // interaction
  let target = 0.5, hover = 0, hoverT = 0, locked = false;
  const mouse = new THREE.Vector2(0.5, 0.5);
  root.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    mouse.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
  });
  const setHover = (side) => {
    if (locked) return;
    const v = side === 'ap' ? -1 : side === 'ds' ? 1 : 0;
    if (v !== hoverT && v !== 0) Sound.play('tick');
    hoverT = v;
    sides.ap.classList.toggle('is-dim', v === 1);
    sides.ds.classList.toggle('is-dim', v === -1);
  };
  Object.entries(sides).forEach(([k, el]) => {
    el.addEventListener('pointerenter', () => setHover(k));
    el.addEventListener('focusin', () => setHover(k));
    el.addEventListener('pointerleave', () => setHover(null));
    el.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      enter(k, el.href);
    });
  });
  addEventListener('keydown', (e) => {
    if (locked) return;
    const v = isVert();
    if ((!v && e.key === 'ArrowLeft') || (v && e.key === 'ArrowUp')) { setHover('ap'); sides.ap.focus(); }
    if ((!v && e.key === 'ArrowRight') || (v && e.key === 'ArrowDown')) { setHover('ds'); sides.ds.focus(); }
  });

  function enter(side, href) {
    if (locked) return;
    locked = true;
    Sound.play('whoosh');
    const to = side === 'ap' ? 1.08 : -0.08;
    const from = U.uSplit.value;
    const t0 = performance.now();
    const dur = reduce ? 10 : 850;
    (function anim(now) {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      U.uSplit.value = from + (to - from) * e;
      root.style.setProperty('--split', Math.min(1, Math.max(0, U.uSplit.value)));
      U.uFlash.value = Math.max(0, (k - 0.75) / 0.25);
      if (flash) flash.style.opacity = U.uFlash.value;
      if (k < 1) requestAnimationFrame(anim); else window.APDS.go(href);
    })(t0);
  }

  // fighting-game countdown
  let n = 30;
  if (timerEl) setInterval(() => { n = n <= 0 ? 30 : n - 1; timerEl.textContent = String(n).padStart(2, '0'); }, 1000);

  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(root);
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    U.uTime.value += reduce ? 0 : dt;
    if (!locked) {
      hover += (hoverT - hover) * Math.min(1, dt * 6);
      const lean = isVert() ? (0.5 - mouse.y) * 0.06 : (mouse.x - 0.5) * 0.06;
      target = 0.5 - hover * 0.13 + lean;
      U.uSplit.value += (target - U.uSplit.value) * Math.min(1, dt * 5);
      root.style.setProperty('--split', U.uSplit.value.toFixed(4));
    }
    U.uHover.value = hover;
    U.uMouse.value.lerp(mouse, Math.min(1, dt * 4));
    renderer.render(scene, camera);
  });
}

start();
