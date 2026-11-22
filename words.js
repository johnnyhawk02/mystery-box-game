// Find the Word: a word is shown with three objects underneath; she taps the one it names.
// Calm like the letters game: slow eased motion, no flashing, no fail sounds. A wrong tap just
// makes the right object give a small hop, and after two wrong taps its pad glows softly.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { RoomEnvironment } from './vendor/environments/RoomEnvironment.js';
import { DRACOLoader } from './vendor/loaders/DRACOLoader.js';

const V = new URL(import.meta.url).searchParams.get('v') || '';
const { OBJECTS, SETUP_DEFAULTS } = await import('./objects.js' + (V ? '?v=' + V : ''));

const BG = '#d9d2c5';
const SPACING = 1.5;          // between the three pads
const PAD_R = 0.47;
const PAD_TOP = 0.11;
const SHOWN = 2.1;            // object size on its pad: bigger than in the letters game, as there are only three
const SPIN_SECONDS = 9;       // one slow turn while waiting

// ---------------- renderer, scene, lights (as the letters game) ----------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.add(new THREE.HemisphereLight(0xfffaf0, 0xb3a893, 1.7));
const sun = new THREE.DirectionalLight(0xfff3e2, 1.9);
sun.position.set(-3, 7, 4.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 3.5, bottom: -3.5, near: 1, far: 20 });
sun.shadow.radius = 6; sun.shadow.bias = -0.0005; scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: BG, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.12;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

// ---------------- helpers ----------------
const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(t, 0), 1));
const tweens = [];
const tween = (seconds, step) => new Promise(resolve => tweens.push({ t: 0, seconds, step, resolve }));
const wait = s => tween(s, () => {});
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

// sound (spoken word) and capitals/small letters: the same switches as the letters game
let soundOn = store.get('mb-sound') !== 'off';
const soundBtn = document.getElementById('sound');
const showSound = () => { soundBtn.textContent = soundOn ? '🔊' : '🔈'; soundBtn.style.opacity = soundOn ? 1 : 0.6; };
showSound();
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn; showSound(); store.set('mb-sound', soundOn ? 'on' : 'off');
  if (!soundOn) window.speechSynthesis?.cancel();
});
function say(text) {
  if (!soundOn || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = 0.8; u.pitch = 1.05; u.lang = 'en-GB';
  speechSynthesis.speak(u);
}
const wordEl = document.getElementById('word');
let lowerCase = store.get('mb-case') === 'lower', shownWord = '';
const caseBtn = document.getElementById('case');
function showWord(w) {
  if (w !== undefined) shownWord = w;
  caseBtn.textContent = lowerCase ? 'abc' : 'ABC';
  if (shownWord) wordEl.textContent = lowerCase ? shownWord.toLowerCase() : shownWord.toUpperCase();
  wordEl.classList.toggle('on', !!shownWord);
}
showWord('');
caseBtn.addEventListener('click', () => { lowerCase = !lowerCase; store.set('mb-case', lowerCase ? 'lower' : 'upper'); showWord(); });
wordEl.addEventListener('pointerdown', () => shownWord && say(shownWord));
document.getElementById('full').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); }
  } catch (e) {}
});

// ---------------- the three pads ----------------
const pads = [-1, 0, 1].map(i => {
  const g = new THREE.Group(); g.position.set(i * SPACING, 0, 0); scene.add(g);
  const mat = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, PAD_R, 0.08, 64), mat('#9fbfa8')); base.position.y = 0.04;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.022, 16, 96),
    new THREE.MeshStandardMaterial({ color: '#f6e7c4', emissive: '#ffd98a', emissiveIntensity: 0.2, roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.085;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 64), mat('#f1ead9', 0.5)); top.position.y = 0.095;
  for (const m of [base, rim, top]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  return { g, rim, top, glow: 0.2, item: null };
});
const padTop = i => pads[i].g.position.clone().setY(PAD_TOP);

// ---------------- camera: fit the pads and the objects on them, below the word ----------------
const TILT = 32 * Math.PI / 180;
const viewDir = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT));
const fitPoints = [];
for (const p of pads) for (const dx of [-PAD_R, PAD_R]) for (const dz of [-PAD_R, PAD_R]) fitPoints.push(p.g.position.clone().add(new THREE.Vector3(dx, 0, dz)));
for (const p of pads) for (const dx of [-0.45, 0.45]) fitPoints.push(p.g.position.clone().add(new THREE.Vector3(dx, 1.3, 0)));
function fit() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const look = new THREE.Vector3(0, 0.4, 0), v = new THREE.Vector3();
  // the word takes the top of the screen; the objects sit in the space under it
  const wordBottom = 1 - 2 * Math.min(0.32, (wordEl.getBoundingClientRect().bottom + 12) / h);
  const place = d => { camera.position.copy(look).addScaledVector(viewDir, d); camera.lookAt(look); camera.updateMatrixWorld(); camera.updateProjectionMatrix(); };
  for (let pass = 0; pass < 4; pass++) {
    let lo = 1, hi = 40;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2; place(d);
      const ok = fitPoints.every(p => { v.copy(p).project(camera); return Math.abs(v.x) < 0.9 && v.y < wordBottom - 0.04 && v.y > -0.9; });
      if (ok) hi = d; else lo = d;
    }
    place(hi);
    let y0 = 1, y1 = -1;
    for (const p of fitPoints) { v.copy(p).project(camera); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const halfH = hi * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    // centre the objects in the space between the word and the bottom edge
    look.addScaledVector(up, ((y0 + y1) / 2 - (wordBottom - 0.04 - 0.9) / 2) * halfH);
  }
}
window.addEventListener('resize', fit);

// ---------------- objects ----------------
const loader = new GLTFLoader();
loader.setDRACOLoader(new DRACOLoader().setDecoderPath('vendor/draco/').setDecoderConfig({ type: 'wasm' }));
const load = url => new Promise((res, rej) => loader.load(url + (V ? '?v=' + V : ''), res, undefined, rej));
const BLANK = { size: 1, turn: 0, tiltX: 0, tiltZ: 0, lift: 0, offX: 0, offZ: 0 };
let saved = {};
try { if (store.get('mb-defaults')) saved = JSON.parse(store.get('mb-setup') || '{}'); } catch (e) {}
const setupOf = name => ({ ...BLANK, ...(SETUP_DEFAULTS[name] || {}), ...(saved[name] || {}) });
const DEG = Math.PI / 180;
const loaded = {};
function getItem(o) {
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

// ---------------- shimmer in and out (as the letters game) ----------------
const sparkTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,250,235,0.55)'); r.addColorStop(1, 'rgba(255,250,235,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const shimmers = [];
function shimmer(base, height, radius, seconds) {
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
    s.pts.material.size = 0.045 + 0.012 * Math.sin(clock * 3);
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
async function beamIn(it, at) {
  const n = it.node; n.position.copy(at); n.scale.setScalar(SHOWN); n.rotation.set(0, 0, 0);
  setFade(it, 0); n.visible = true;
  const h = it.height * SHOWN;
  shimmer(at.clone(), h * 1.25, Math.max(0.12, h * 0.45), 2.8);
  await tween(2.2, t => { const f = ease((t - 0.2) / 0.8); setFade(it, f); n.scale.setScalar(SHOWN * (0.96 + 0.04 * f)); });
  setFade(it, 1);
}
async function beamOut(it) {
  const n = it.node, h = it.height * n.scale.x;
  shimmer(n.position.clone(), h * 1.25, Math.max(0.1, h * 0.45), 2.4);
  await tween(1.8, t => setFade(it, 1 - ease(t / 0.9)));
  n.visible = false; setFade(it, 1);
}

// ---------------- rounds ----------------
// every object is asked for once before any repeats; the other two are any two different objects
let bag = [];
function choosePicks() {
  if (!bag.length) bag = shuffle(OBJECTS.slice());
  const target = bag.pop();
  const others = shuffle(OBJECTS.filter(o => o !== target)).slice(0, 2);
  return { target, all: shuffle([target, ...others]) };
}
let state = 'busy', target = null, tries = 0, clock = 0, next = choosePicks();
const prefetch = p => p.all.forEach(getItem);
prefetch(next);
async function newRound() {
  state = 'busy'; tries = 0;
  const picks = next; next = choosePicks();
  const items = await Promise.all(picks.all.map(getItem));
  prefetch(next);
  items.forEach((it, i) => { pads[i].item = it; });
  target = items.find(it => it.name === picks.target.name);
  showWord(picks.target.word);
  await wait(0.5);
  say(picks.target.word);
  await Promise.all(items.map((it, i) => wait(i * 0.35).then(() => beamIn(it, padTop(i)))));
  state = 'waiting';
}
function hop(it) {   // a small, soft hop: 'here I am'
  const n = it.node, y0 = n.position.y;
  return tween(1.2, t => { n.position.y = y0 + 0.07 * Math.sin(Math.PI * ease(t)); });
}
async function chosen(it) {
  if (it === target) {
    state = 'busy'; say(target.word);
    const rest = pads.map(p => p.item).filter(x => x !== target);
    const pad = pads.find(p => p.item === target);
    pad.glowTo = 0.8;
    rest.forEach(beamOut);
    // the right one turns round once, slow-faster-slow, rising a little as it turns
    const n = target.node, r0 = n.rotation.y, y0 = n.position.y;
    await tween(2.0, t => { n.rotation.y = r0 + 2 * Math.PI * ease(t); n.position.y = y0 + 0.1 * Math.sin(Math.PI * t); });
    await wait(1.0);
    showWord('');
    delete pad.glowTo;
    await beamOut(target);
    for (const p of pads) p.item = null;
    await wait(0.4);
    newRound();
  } else {
    tries++;
    say(target.word);
    if (state === 'waiting') { state = 'hint'; await hop(target); if (state === 'hint') state = 'waiting'; }
  }
}

// ---------------- input ----------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function toScreen(v) {
  const p = v.clone().project(camera), r = canvas.getBoundingClientRect();
  return { x: (p.x + 1) / 2 * r.width + r.left, y: (1 - p.y) / 2 * r.height + r.top };
}
const middleOf = i => { const it = pads[i].item; return padTop(i).setY(PAD_TOP + (it ? it.height * SHOWN / 2 : 0.2)); };
canvas.addEventListener('pointerdown', e => {
  if (state !== 'waiting' && state !== 'hint') return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // an object or its pad under the finger counts; otherwise the nearest object within a generous reach
  let best = -1, bestD = Math.min(r.width / 6, 160);
  pads.forEach((p, i) => {
    if (!p.item) return;
    if (ray.intersectObject(p.item.node, true).length || ray.intersectObject(p.g, true).length) { best = i; bestD = 0; return; }
    const s = toScreen(middleOf(i)), d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
    if (d < bestD) { best = i; bestD = d; }
  });
  if (best >= 0) chosen(pads[best].item);
});

// ---------------- loop ----------------
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt; const k = Math.min(1, tw.t / tw.seconds); tw.step(k);
    if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
  updateShimmers(dt);
  for (const p of pads) {
    if (p.item && p.item.node.visible && (state === 'waiting' || state === 'hint')) p.item.node.rotation.y += dt * 2 * Math.PI / SPIN_SECONDS;
    // after two wrong taps the right object's pad breathes a soft glow
    const want = p.glowTo ?? (tries >= 2 && p.item === target && state !== 'busy' ? 0.55 + 0.2 * Math.sin(clock * 2) : 0.2);
    p.glow += (want - p.glow) * Math.min(1, dt * 3);
    p.rim.material.emissiveIntensity = p.glow;
  }
  renderer.render(scene, camera);
});

// read-only hook for automated tests
window.__wg = { get state() { return state; }, get target() { return target && target.name; },
  names: () => pads.map(p => p.item && p.item.name),
  padScreen: i => toScreen(middleOf(i)) };

fit();
newRound();
