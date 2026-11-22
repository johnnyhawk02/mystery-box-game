// The shared 3D stage for the Words and Talker games: the same calm room, light, shadows, objects,
// shimmer in/out, soft pads, spoken words and the corner buttons as the letters game.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { RoomEnvironment } from './vendor/environments/RoomEnvironment.js';
import { DRACOLoader } from './vendor/loaders/DRACOLoader.js';
export { THREE };

const V = new URL(import.meta.url).searchParams.get('v') || '';
const { OBJECTS, SETUP_DEFAULTS } = await import('./objects.js' + (V ? '?v=' + V : ''));
export { OBJECTS };

const BG = '#d9d2c5';
export const PAD_R = 0.47, PAD_TOP = 0.11;

// ---------------- renderer, scene, lights ----------------
export const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
export const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.add(new THREE.HemisphereLight(0xfffaf0, 0xb3a893, 1.7));
export const sun = new THREE.DirectionalLight(0xfff3e2, 1.9);
sun.position.set(-3, 7, 4.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 4, bottom: -4, near: 1, far: 20 });
sun.shadow.radius = 6; sun.shadow.bias = -0.0005; scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: BG, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.12;
export const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

// ---------------- helpers ----------------
export const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(t, 0), 1));
const tweens = [];
export const tween = (seconds, step) => new Promise(resolve => tweens.push({ t: 0, seconds, step, resolve }));
export const wait = s => tween(s, () => {});
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
  setJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
export const clock = { t: 0 };

// ---------------- corner buttons: sound, capitals/small letters, full screen ----------------
let soundOn = store.get('mb-sound') !== 'off';
const soundBtn = document.getElementById('sound');
const showSound = () => { if (soundBtn) { soundBtn.textContent = soundOn ? '🔊' : '🔈'; soundBtn.style.opacity = soundOn ? 1 : 0.6; } };
showSound();
soundBtn?.addEventListener('click', () => {
  soundOn = !soundOn; showSound(); store.set('mb-sound', soundOn ? 'on' : 'off');
  if (!soundOn) window.speechSynthesis?.cancel();
});
export function say(text) {
  if (!soundOn || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = 0.8; u.pitch = 1.05; u.lang = 'en-GB';
  speechSynthesis.speak(u);
}
export const letterCase = { lower: store.get('mb-case') === 'lower', listeners: [] };
export const cased = w => letterCase.lower ? w.toLowerCase() : w.toUpperCase();
const caseBtn = document.getElementById('case');
const showCase = () => { if (caseBtn) caseBtn.textContent = letterCase.lower ? 'abc' : 'ABC'; };
showCase();
caseBtn?.addEventListener('click', () => {
  letterCase.lower = !letterCase.lower; store.set('mb-case', letterCase.lower ? 'lower' : 'upper'); showCase();
  letterCase.listeners.forEach(f => f());
});
document.getElementById('full')?.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); }
  } catch (e) {}
});

// ---------------- soft round pads ----------------
export function makePad(at) {
  const g = new THREE.Group(); g.position.copy(at); scene.add(g);
  const mat = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, PAD_R, 0.08, 64), mat('#9fbfa8')); base.position.y = 0.04;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.022, 16, 96),
    new THREE.MeshStandardMaterial({ color: '#f6e7c4', emissive: '#ffd98a', emissiveIntensity: 0.2, roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.085;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 64),
    new THREE.MeshStandardMaterial({ color: '#f1ead9', roughness: 0.5, emissive: '#ffd27a', emissiveIntensity: 0 }));
  top.position.y = 0.095;
  for (const m of [base, rim, top]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  const pad = { g, rim, top, glow: 0, want: 0, item: null };
  // glow 0..1: the rim and the top warm up softly together
  pad.setGlow = v => { rim.material.emissiveIntensity = 0.2 + 1.1 * v; top.material.emissiveIntensity = 0.6 * v; };
  pads.push(pad);
  return pad;
}
const pads = [];

// ---------------- camera fit: keep the given points in view, under whatever DOM sits at the top ----------------
export function fitCamera(points, tiltDeg, topPx = 0, margin = 0.9) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const tilt = tiltDeg * Math.PI / 180, viewDir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
  const look = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3()), v = new THREE.Vector3();
  const top = 1 - 2 * Math.min(0.4, topPx / h) - 0.04, bottom = -margin;
  const place = d => { camera.position.copy(look).addScaledVector(viewDir, d); camera.lookAt(look); camera.updateMatrixWorld(); camera.updateProjectionMatrix(); };
  for (let pass = 0; pass < 4; pass++) {
    let lo = 0.5, hi = 60;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2; place(d);
      const ok = points.every(p => { v.copy(p).project(camera); return Math.abs(v.x) < margin && v.y < top && v.y > bottom; });
      if (ok) hi = d; else lo = d;
    }
    place(hi);
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    for (const p of points) { v.copy(p).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const halfH = hi * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = halfH * camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    look.addScaledVector(right, (x0 + x1) / 2 * halfW).addScaledVector(up, ((y0 + y1) / 2 - (top + bottom) / 2) * halfH);
  }
  place(camera.position.distanceTo(look));
}

// ---------------- objects ----------------
const loader = new GLTFLoader();
loader.setDRACOLoader(new DRACOLoader().setDecoderPath('vendor/draco/').setDecoderConfig({ type: 'wasm' }));
const load = url => new Promise((res, rej) => loader.load(url + (V ? '?v=' + V : ''), res, undefined, rej));
const BLANK = { size: 1, turn: 0, tiltX: 0, tiltZ: 0, lift: 0, offX: 0, offZ: 0 };
const saved = store.get('mb-defaults') ? store.json('mb-setup', {}) : {};   // the grown-ups' tweaks from the letters game
const setupOf = name => ({ ...BLANK, ...(SETUP_DEFAULTS[name] || {}), ...(saved[name] || {}) });
const DEG = Math.PI / 180;
const loaded = {};
// each call gives the object's one copy; a game never shows the same object twice at once
export function getItem(o) {
  return loaded[o.name] ??= load(`assets/objects/${o.name}.glb`).then(g => {
    const node = new THREE.Group(), inner = new THREE.Group(); inner.add(g.scene); node.add(inner);
    node.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    node.visible = false; scene.add(node);
    const c = setupOf(o.name);
    inner.scale.setScalar(c.size);
    inner.rotation.set(c.tiltX * DEG, c.turn * DEG, c.tiltZ * DEG, 'XYZ');
    inner.position.set(c.offX, c.lift, c.offZ);
    const height = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3()).y;
    return { ...o, node, height };
  });
}

// ---------------- shimmer in and out ----------------
const sparkTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,250,235,0.55)'); r.addColorStop(1, 'rgba(255,250,235,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const shimmers = [];
export function shimmer(base, height, radius, seconds) {
  const N = 180, pos = new Float32Array(N * 3), seed = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = radius * Math.sqrt(Math.random());
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * height; pos[i * 3 + 2] = Math.sin(a) * r;
    seed.push(0.6 + Math.random() * 0.8);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: sparkTex, color: 0xffdf9e, size: 0.05, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(g, m); pts.position.copy(base); scene.add(pts);
  return new Promise(resolve => shimmers.push({ pts, t: 0, seconds, height, seed, resolve }));
}
function updateShimmers(dt) {
  for (let i = shimmers.length - 1; i >= 0; i--) {
    const s = shimmers[i]; s.t += dt;
    const k = s.t / s.seconds, env = Math.min(1, k / 0.2) * Math.min(1, (1 - k) / 0.3);
    s.pts.material.opacity = Math.max(0, env) * 0.85;
    s.pts.material.size = 0.045 + 0.012 * Math.sin(clock.t * 3);
    const p = s.pts.geometry.attributes.position;
    for (let j = 0; j < p.count; j++) { let y = p.getY(j) + dt * 0.12 * s.seed[j]; if (y > s.height) y -= s.height; p.setY(j, y); }
    p.needsUpdate = true;
    if (k >= 1) { scene.remove(s.pts); s.pts.geometry.dispose(); s.pts.material.dispose(); shimmers.splice(i, 1); s.resolve(); }
  }
}
// a fading object casts a speckled shadow whose share of speckles follows the fade (see the letters game)
function setShadowFade(it, f) {
  if (!it.depthMat) {
    const uFade = { value: 1 };
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = sh => {
      sh.uniforms.uFade = uFade;
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uFade;\nfloat mbHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\nvoid main() {\n  if (mbHash(floor(gl_FragCoord.xy)) > uFade) discard;');
    };
    it.depthMat = m; it.shadowFade = uFade;
    it.node.traverse(o => { if (o.isMesh) o.customDepthMaterial = m; });
  }
  it.shadowFade.value = f;
}
function setFade(it, f) {
  setShadowFade(it, f);
  it.node.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.userData.baseOpacity === undefined) { m.userData.baseOpacity = m.opacity; m.userData.baseTransparent = m.transparent; }
      const fading = f < 1 && !m.userData.baseTransparent;
      m.opacity = m.userData.baseOpacity * f;
      if (m.alphaHash !== fading) { m.alphaHash = fading; m.needsUpdate = true; }
      m.transparent = !!m.userData.baseTransparent; m.depthWrite = !m.userData.baseTransparent;
    }
  });
}
export async function beamIn(it, at, scale) {
  const n = it.node; n.position.copy(at); n.scale.setScalar(scale); n.rotation.set(0, 0, 0);
  setFade(it, 0); n.visible = true;
  const h = it.height * scale;
  shimmer(at.clone(), h * 1.25, Math.max(0.12, h * 0.45), 2.8);
  await tween(2.2, t => { const f = ease((t - 0.2) / 0.8); setFade(it, f); n.scale.setScalar(scale * (0.96 + 0.04 * f)); });
  setFade(it, 1);
}
export async function beamOut(it) {
  const n = it.node, h = it.height * n.scale.x;
  shimmer(n.position.clone(), h * 1.25, Math.max(0.1, h * 0.45), 2.4);
  await tween(1.8, t => setFade(it, 1 - ease(t / 0.9)));
  n.visible = false; setFade(it, 1);
}

// ---------------- screen helpers ----------------
export function toScreen(v) {
  const p = v.clone().project(camera), r = canvas.getBoundingClientRect();
  return { x: (p.x + 1) / 2 * r.width + r.left, y: (1 - p.y) / 2 * r.height + r.top };
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function rayFrom(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); return ray;
}

// ---------------- grown-ups' panel: opened by holding the faint gear, so a child won't open it by accident ----------------
export function holdToOpen(btn, open) {
  let timer = null;
  btn.addEventListener('pointerdown', () => { timer = setTimeout(open, 800); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => clearTimeout(timer));
}
// a row of object chips a grown-up turns on and off; calls onChange with the chosen names (in OBJECTS order)
export function objectPicker(el, chosen, onChange) {
  el.innerHTML = '';
  const set = new Set(chosen);
  const tools = document.createElement('div'); tools.className = 'tools';
  for (const [label, fn] of [['All', () => OBJECTS.forEach(o => set.add(o.name))], ['None', () => set.clear()]]) {
    const b = document.createElement('button'); b.textContent = label;
    b.addEventListener('click', () => { fn(); draw(); onChange(OBJECTS.filter(o => set.has(o.name)).map(o => o.name)); });
    tools.appendChild(b);
  }
  el.appendChild(tools);
  const chips = document.createElement('div'); chips.className = 'chips'; el.appendChild(chips);
  const btns = OBJECTS.map(o => {
    const b = document.createElement('button'); b.textContent = o.word;
    b.addEventListener('click', () => { set.has(o.name) ? set.delete(o.name) : set.add(o.name); draw(); onChange(OBJECTS.filter(x => set.has(x.name)).map(x => x.name)); });
    chips.appendChild(b); return [o, b];
  });
  const draw = () => btns.forEach(([o, b]) => b.classList.toggle('on', set.has(o.name)));
  draw();
}

// ---------------- frame loop ----------------
const frameFns = [];
export const onFrame = fn => frameFns.push(fn);
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock.t += dt;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt; const k = Math.min(1, tw.t / tw.seconds); tw.step(k);
    if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
  updateShimmers(dt);
  for (const p of pads) { p.glow += (p.want - p.glow) * Math.min(1, dt * 2.5); p.setGlow(p.glow); }
  for (const f of frameFns) f(dt);
  renderer.render(scene, camera);
});
