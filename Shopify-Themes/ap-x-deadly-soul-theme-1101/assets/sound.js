/* Tiny WebAudio synth for game-menu UI sounds. No audio files. */
let ctx = null;
let master = null;
let last = 0;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);
  return ctx;
}

function tone(freq, dur, { type = 'square', vol = 0.5, at = 0, slide = 0 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.3, at = 0) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 1800;
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(f).connect(g).connect(master);
  s.start(ctx.currentTime + at);
}

const presets = {
  hover() { tone(1320, 0.04, { vol: 0.12 }); },
  tick() { tone(880, 0.05, { vol: 0.2 }); },
  select() { tone(660, 0.07, { vol: 0.3 }); tone(990, 0.09, { vol: 0.3, at: 0.06 }); },
  back() { tone(520, 0.08, { vol: 0.25, slide: -200 }); },
  swap() { noise(0.12, 0.25); tone(220, 0.16, { type: 'sawtooth', vol: 0.18, slide: 600 }); },
  start() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { vol: 0.3, at: i * 0.07 })); noise(0.25, 0.12, 0.28); },
  coin() { tone(988, 0.08, { vol: 0.3 }); tone(1319, 0.28, { vol: 0.3, at: 0.08 }); },
  error() { tone(180, 0.18, { type: 'sawtooth', vol: 0.25 }); },
  whoosh() { noise(0.35, 0.22); tone(140, 0.4, { type: 'sine', vol: 0.4, slide: -80 }); },
};

export const Sound = {
  enabled: false,
  unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
  play(name) {
    if (!this.enabled) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const now = performance.now();
    if (name === 'hover' && now - last < 45) return;
    last = now;
    try { presets[name] && presets[name](); } catch (e) {}
  },
};
