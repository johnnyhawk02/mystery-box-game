// Mystery Box: tap the box, see the object, drag it to the letter it starts with.
// Calm by design: slow eased motion, no flashing, no fail sounds. A wrong drop just floats back.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { RoomEnvironment } from './vendor/environments/RoomEnvironment.js';
import { DRACOLoader } from './vendor/loaders/DRACOLoader.js';

// the objects and their grown-up setup defaults live in objects.js, shared with the word game
const V = new URL(import.meta.url).searchParams.get('v') || '';
const { OBJECTS, SETUP_DEFAULTS } = await import('./objects.js' + (V ? '?v=' + V : ''));
// how many objects make a round (setup → View → Objects per round); 26 = the whole alphabet
const roundSize = () => cam().perRound;
const SPIN_SECONDS = 7;     // one slow turn while the object waits to be dragged
const BOX_AT = new THREE.Vector3(-2.2, 0, 0.62);   // bottom-left, so the shown object has open space above it
const BOX_SCALE = 0.85;
const BOARD_AT = new THREE.Vector3(0, 0, -0.15);
// how big an object is shown when it comes out of the box (and while carried): the View tab's 'Shown size'
const revealScale = () => cam().shown;
const PLACED_SCALE = 0.9;  // side on, objects stand taller on screen, so a little smaller in the slot
const DRAG_Y = 0.32;        // height objects float at while being dragged
const DROP_RADIUS = 0.3;    // how close to a slot counts as dropping on it
const HINT_EVERY = 6;       // seconds of no activity before the box gently invites a tap
const BG = '#d9d2c5';

// ---------------- renderer, scene, lights ----------------
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
sun.position.set(-3, 7, 4.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 3.5, bottom: -3.5, near: 1, far: 20 });
sun.shadow.radius = 6; sun.shadow.bias = -0.0005;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: BG, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// soft room reflections so metal (spoon, watering can) looks like metal rather than dark grey
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.12;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

// ---------------- small helpers ----------------
const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(t, 0), 1));
const tweens = [];
function tween(seconds, step) {
  return new Promise(resolve => tweens.push({ t: 0, seconds, step, resolve }));
}
const wait = s => tween(s, () => {});
function moveTo(obj, toPos, toScale, seconds, arc = 0) {
  const p0 = obj.position.clone(), s0 = obj.scale.x;
  return tween(seconds, t => {
    const k = ease(t);
    obj.position.lerpVectors(p0, toPos, k);
    obj.position.y += Math.sin(Math.PI * k) * arc;
    obj.scale.setScalar(s0 + (toScale - s0) * k);
  });
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let soundOn = true;
try { soundOn = localStorage.getItem('mb-sound') !== 'off'; } catch (e) {}
const soundBtn = document.getElementById('sound');
const showSound = () => { soundBtn.textContent = soundOn ? '🔊' : '🔈'; soundBtn.style.opacity = soundOn ? 1 : 0.6; };
showSound();
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn; showSound();
  try { localStorage.setItem('mb-sound', soundOn ? 'on' : 'off'); } catch (e) {}
  if (!soundOn) voice.hush();
});
// recorded Sonia clips where there are some, the device's voice otherwise (voice.js)
const voice = await import('./voice.js' + (V ? '?v=' + V : ''));
function say(text) { if (soundOn) voice.speak(text); }
document.getElementById('full').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); }
  } catch (e) {}
});

// ---------------- load models ----------------
const loader = new GLTFLoader();
// some detailed models (the nest) are Draco-compressed to keep them small
loader.setDRACOLoader(new DRACOLoader().setDecoderPath('vendor/draco/').setDecoderConfig({ type: 'wasm' }));
// the page passes its version (main.js?v=…) so a new release never mixes with cached old models
const load = url => new Promise((res, rej) => loader.load(url + (V ? '?v=' + V : ''), res, undefined, rej));
const [boxG, boardG] = await Promise.all([load('assets/mystery_box.glb'), load('assets/alphabet_board.glb')]);
const shadowy = root => root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

const box = boxG.scene; box.position.copy(BOX_AT); box.scale.setScalar(BOX_SCALE); shadowy(box); scene.add(box);
const mixer = new THREE.AnimationMixer(box);
const clips = Object.fromEntries(boxG.animations.map(c => [c.name, c]));
const board = boardG.scene; board.position.copy(BOARD_AT); shadowy(board); scene.add(board);
scene.updateMatrixWorld(true);

const revealPoint = box.getObjectByName('reveal_point').getWorldPosition(new THREE.Vector3());
const insideBox = BOX_AT.clone().add(new THREE.Vector3(0, 0.1, 0));
const aboveBox = BOX_AT.clone().add(new THREE.Vector3(0, 0.85, 0));
// the tile centre is this far in front of its slot (z)
const SLOT_TO_TILE = 0.085;
const slots = {}, tiles = {};
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  slots[ch] = board.getObjectByName('slot_' + ch).getWorldPosition(new THREE.Vector3());
  const t = board.getObjectByName('tile_' + ch); const mats = [];
  t.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.emissive = new THREE.Color('#fff4d0'); mats.push(m.material); } });
  tiles[ch] = { mats, glow: 0, target: 0 };
}

// capitals or small letters: one switch, remembered on this device
const caseBtn = document.getElementById('case');
let lowerCase = false;
try { lowerCase = localStorage.getItem('mb-case') === 'lower'; } catch (e) {}
function showCase() {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    board.getObjectByName('upper_' + ch).visible = !lowerCase;
    board.getObjectByName('lower_' + ch).visible = lowerCase;
  }
  caseBtn.textContent = lowerCase ? 'abc' : 'ABC';
  if (shownWord) showName(shownWord);
}
showCase();
caseBtn.addEventListener('click', () => {
  lowerCase = !lowerCase; showCase();
  try { localStorage.setItem('mb-case', lowerCase ? 'lower' : 'upper'); } catch (e) {}
});

// ---------------- grown-ups' setup: size, turn, tilt and lift per object ----------------
// SETUP_DEFAULTS can be filled from the setup panel's "Copy" output to make them the same on every device.
// Johnny's settings from 2026-11-21 (evening). Bump DEFAULTS_ID when these change: devices then drop their own
// saved tweaks so everyone starts from the same defaults.
const DEFAULTS_ID = '2026-11-22b';
try { if (localStorage.getItem('mb-defaults') !== DEFAULTS_ID) {
  localStorage.removeItem('mb-setup'); localStorage.removeItem('mb-sizes'); localStorage.removeItem('mb-camera');
  localStorage.setItem('mb-defaults', DEFAULTS_ID);
} } catch (e) {}
const BLANK = { size: 1, turn: 0, tiltX: 0, tiltZ: 0, lift: 0, offX: 0, offZ: 0 };
let setup = {};
try {
  setup = JSON.parse(localStorage.getItem('mb-setup') || '{}');
  const old = JSON.parse(localStorage.getItem('mb-sizes') || '{}');   // sizes saved by v1.4
  for (const [k, v] of Object.entries(old)) setup[k] = { ...(setup[k] || {}), size: setup[k]?.size ?? v };
} catch (e) {}
const setupOf = name => ({ ...BLANK, ...(SETUP_DEFAULTS[name] || {}), ...(setup[name] || {}) });
const sizeOf = name => setupOf(name).size;
function saveSetup() { try { localStorage.setItem('mb-setup', JSON.stringify(setup)); localStorage.removeItem('mb-sizes'); } catch (e) {} }
const DEG = Math.PI / 180;
const HOVER = 0.04, BOB = 0.02;   // side-on objects float gently above the board
// tip an object towards the camera: fully side on when it looks straight down, upright when it looks from the side
// flat things (an X-ray sheet, a spoon, gloves) read best seen from above, so they stay lying down
const LIES_FLAT = new Set(['xray', 'spoon', 'gloves']);
function standUp(it) {
  const k = LIES_FLAT.has(it.name) ? 0 : cam().tilt * DEG, size = sizeOf(it.name);
  it.tilt.rotation.x = -k;
  it.lift.position.z = -0.05 * Math.sin(k);   // sit towards the back of the space, above its letter
  it.pivot.position.y = -it.baseHeight * size / 2 * Math.sin(k);   // turn about its middle
  it.liftBase = (it.baseRadius * size * 0.55 + HOVER) * Math.sin(k);   // clear of the board, hovering a little above it
}
function applySetup(it) {
  const c = setupOf(it.name);
  if (it.tilt) standUp(it);
  it.inner.scale.setScalar(c.size);
  // the fwd/back tilt was tuned for the old angled camera; side on it would tip things over, so only flat things keep it
  const tx = it.tilt && !LIES_FLAT.has(it.name) ? c.tiltX * (1 - Math.sin(cam().tilt * DEG)) : c.tiltX;
  it.inner.rotation.set(tx * DEG, c.turn * DEG, c.tiltZ * DEG, 'XYZ');   // turn first, then tilt
  it.inner.position.set(c.offX, c.lift, c.offZ);
}

// objects load only when a round needs them, so the game starts fast on a phone
const loaded = {};
function getItem(o) {
  return loaded[o.name] ??= load(`assets/objects/${o.name}.glb`).then(g => {
    // node is moved and scaled by the game; inner carries the grown-ups' size setting for this object
    // node > lift > tilt > spin > pivot > inner: with the camera looking straight down, each object is tipped
    // towards it (tilt) so it is seen side on, like a stand-up picture; spin turns it about its own up axis
    const node = new THREE.Group(), lift = new THREE.Group(), tilt = new THREE.Group(), spin = new THREE.Group(),
          pivot = new THREE.Group(), inner = new THREE.Group();
    inner.add(g.scene); pivot.add(inner); spin.add(pivot); tilt.add(spin); lift.add(tilt); node.add(lift); shadowy(node);
    node.visible = false; scene.add(node);
    const bb = new THREE.Box3().setFromObject(node), sz = bb.getSize(new THREE.Vector3());
    const baseHeight = sz.y, baseRadius = Math.hypot(sz.x, sz.z) / 2;
    const it = { ...o, node, inner, lift, tilt, spin, pivot, baseHeight, baseRadius, placed: false, get height() { return this.baseHeight * sizeOf(this.name); } };
    applySetup(it); allItems.push(it); return it;
  });
}
const allItems = [];
let round = [], roundReady = null, roundTotal = 0;
function newRound() {
  // one object per letter in a round (some letters have two objects to choose from)
  const picks = [], used = new Set();
  for (const o of shuffle(OBJECTS.slice())) if (!used.has(o.letter) && picks.length < roundSize()) { picks.push(o); used.add(o.letter); }
  if (cam().reveal === 'box') {   // the box shows its whole jumble, so load the lot up front
    roundReady = Promise.all(picks.map(getItem)).then(r => { round = r; queue = shuffle(r.slice()); fillPile(r); });
  } else {                        // shimmer mode: load each object only when it's called for (quick start on an iPad)
    round = []; queue = shuffle(picks.slice()); roundTotal = picks.length;
    getItem(queue[queue.length - 1]);   // warm up the first one
    roundReady = Promise.resolve();
  }
  roundTotal = picks.length;
  return roundReady;
}

// ---------------- camera framing (fits any screen, incl. a phone in landscape) ----------------
const fitPoints = [];
for (const root of [box, board]) {
  const b = new THREE.Box3().setFromObject(root);
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) fitPoints.push(new THREE.Vector3(x, y, z));
}
for (const dx of [-0.45, 0.45]) fitPoints.push(revealPoint.clone().add(new THREE.Vector3(dx, 0.45, 0)));   // room for the shown object
const lookAt = new THREE.Box3().setFromPoints(fitPoints).getCenter(new THREE.Vector3());
lookAt.y = 0.25;
// camera: tilt (degrees above the table), turn, zoom and pan, all adjustable in setup
const CAMERA_DEFAULTS = {tilt: 89, turn: 0, zoom: 1, panX: 0, panZ: 0, shown: 1.55, reveal: 'beam'};
const CAM_BLANK = { tilt: 66, turn: 0, zoom: 1, panX: 0, panZ: 0, shown: 1.4, reveal: 'beam', perRound: 26 };   // reveal: 'beam' or 'box'
let camSet = {};
try { camSet = JSON.parse(localStorage.getItem('mb-camera') || '{}'); } catch (e) {}
const cam = () => ({ ...CAM_BLANK, ...CAMERA_DEFAULTS, ...camSet });
function saveCam() { try { localStorage.setItem('mb-camera', JSON.stringify(camSet)); } catch (e) {} }
const viewDir = new THREE.Vector3();
const baseLook = lookAt.clone();
// what the camera must keep in view: the board, plus either the box (box mode) or room above the pad (shimmer mode)
function rebuildFitPoints() {
  fitPoints.length = 0;
  const boxMode = cam().reveal === 'box';
  for (const root of boxMode ? [box, board] : [board]) {
    const b = new THREE.Box3().setFromObject(root);
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) fitPoints.push(new THREE.Vector3(x, y, z));
  }
  if (boxMode) for (const dx of [-0.45, 0.45]) fitPoints.push(revealPoint.clone().add(new THREE.Vector3(dx, 0.45, 0)));
  else {   // the pad is on the board (bottom-left corner); leave headroom for the object shown on it
    const r = 0.47 * 0.85, p = new THREE.Vector3(slots.O.x - 0.2 - r - 0.03, 0.1, (slots.O.z + slots.U.z) / 2 + SLOT_TO_TILE);
    for (const dx of [-r, r]) for (const dz of [-r, r]) fitPoints.push(p.clone().add(new THREE.Vector3(dx, 0, dz)));
    for (const dx of [-0.3, 0.3]) fitPoints.push(p.clone().add(new THREE.Vector3(dx, 0.7, 0)));
  }
  baseLook.copy(new THREE.Box3().setFromPoints(fitPoints).getCenter(new THREE.Vector3())); baseLook.y = 0.25;
}
function fit() {
  allItems.forEach(applySetup);   // objects follow the camera's tilt
  rebuildFitPoints();
  const c = cam();
  viewDir.set(Math.sin(c.turn * Math.PI / 180) * Math.cos(c.tilt * Math.PI / 180), Math.sin(c.tilt * Math.PI / 180),
              Math.cos(c.turn * Math.PI / 180) * Math.cos(c.tilt * Math.PI / 180));
  lookAt.copy(baseLook);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const v = new THREE.Vector3(), place = d => {
    camera.position.copy(lookAt).addScaledVector(viewDir, d); camera.lookAt(lookAt);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  };
  // zoom in until the scene just fits, then nudge the aim so it sits centred; repeat a few times
  for (let pass = 0; pass < 4; pass++) {
    let lo = 1, hi = 40;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2; place(d);
      const ok = fitPoints.every(p => { v.copy(p).project(camera); return Math.abs(v.x) < 0.95 && v.y < 0.78 && v.y > -0.96; });
      if (ok) hi = d; else lo = d;
    }
    place(hi);
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    for (const p of fitPoints) { v.copy(p).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const halfH = hi * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = halfH * camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    lookAt.addScaledVector(right, (x0 + x1) / 2 * halfW).addScaledVector(up, ((y0 + y1) / 2 + 0.06) * halfH);
    if (pass === 3) {   // grown-ups' framing on top of the automatic fit
      const fwd = new THREE.Vector3(viewDir.x, 0, viewDir.z).normalize(), side = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const aim = lookAt.clone().addScaledVector(side, c.panX).addScaledVector(fwd, -c.panZ);
      camera.position.copy(aim).addScaledVector(viewDir, hi / c.zoom); camera.lookAt(aim);
      camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    }
  }
}
window.addEventListener('resize', fit);
fit();

// ---------------- box animations ----------------
function play(name) {
  mixer.stopAllAction();
  const a = mixer.clipAction(clips[name]);
  a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  return wait(clips[name].duration);
}

// ---------------- the felt door and the jumble inside ----------------
// The lid has a square hole closed by four felt flaps (a cross cut). Objects wait in a jumble
// inside; one is pulled up through the flaps, which bend open as it passes, so you glimpse the rest.
const flaps = [0, 1, 2, 3].map(k => box.getObjectByName('flap_' + k));
const flapRest = flaps.map(f => f.quaternion.clone());
let flapOpen = 0;
const flapAxis = new THREE.Vector3(1, 0, 0), flapQ = new THREE.Quaternion();
function setFlaps(f) {
  flapOpen = f;
  flaps.forEach((fl, i) => fl.quaternion.copy(flapRest[i]).multiply(flapQ.setFromAxisAngle(flapAxis, FLAP_SIGN * f * 1.3)));
}
const flapsTo = (f, seconds) => { const f0 = flapOpen; return tween(seconds, t => setFlaps(f0 + (f - f0) * ease(t))); };
const FLAP_SIGN = -1;   // flaps lift up and outwards
const PILE_FLOOR = 0.1;          // inside floor height of the box
const holeBelow = BOX_AT.clone().add(new THREE.Vector3(0, 0.25, 0));
// inside the box everything is shrunk to fit, whatever its board size
const pileScale = it => Math.min(0.85, 0.9 / sizeOf(it.name));
function fillPile(items) {
  if (cam().reveal === 'beam') {   // nothing waits in a box: objects shimmer into view on the pad
    items.forEach(it => { it.node.visible = false; it.placed = false; it.spin.rotation.set(0, 0, 0); });
    return;
  }
  const spots = shuffle([[-0.16, -0.12], [0, -0.14], [0.16, -0.1], [-0.15, 0.12], [0.02, 0.13], [0.17, 0.12]]);
  items.forEach((it, i) => {
    const [x, z] = spots[i % spots.length];
    it.pileAt = BOX_AT.clone().add(new THREE.Vector3(x + (Math.random() - 0.5) * 0.04, PILE_FLOOR + (i % 2) * 0.03, z));
    it.node.position.copy(it.pileAt); it.spin.rotation.set(0, Math.random() * Math.PI * 2, 0);
    it.node.scale.setScalar(pileScale(it)); it.node.visible = true; it.placed = false;
  });
}

// ---------------- shimmer: objects softly sparkle into (and out of) view ----------------
const sparkTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,250,235,0.55)'); r.addColorStop(1, 'rgba(255,250,235,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const shimmers = [];
// a gently rising, twinkling column of soft light around an object, fading in, holding, fading out
function shimmer(base, height, radius, seconds) {
  const N = 220, pos = new Float32Array(N * 3), seed = [];
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
// shadows can't be half-transparent, so a fading object casts a finely speckled shadow instead: the share of
// speckles that block light follows the fade, and the soft shadow blur turns that into a smoothly fading shadow
function setShadowFade(it, f) {
  if (!it.depthMat) {
    const uFade = { value: 1 };
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = sh => {
      sh.uniforms.uFade = uFade;
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform float uFade;\nfloat mbHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\nvoid main() {\n  if (mbHash(floor(gl_FragCoord.xy)) > uFade) discard;');
    };
    it.depthMat = m; it.shadowFade = uFade;
    it.node.traverse(o => { if (o.isMesh) o.customDepthMaterial = m; });
  }
  it.shadowFade.value = f;
}
// fade an object's materials (remembering which were see-through to begin with) and its shadow with it
function setFade(it, f) {
  setShadowFade(it, f);
  it.node.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.userData.baseOpacity === undefined) { m.userData.baseOpacity = m.opacity; m.userData.baseTransparent = m.transparent; }
      // fade with a fine 'hashed' see-through pattern rather than blending: it keeps the object's own depth
      // order, so no faces go missing while it appears (blended fading lost some top faces)
      const fading = f < 1 && !m.userData.baseTransparent;
      m.opacity = m.userData.baseOpacity * f;
      if (m.alphaHash !== fading) { m.alphaHash = fading; m.needsUpdate = true; }
      m.transparent = !!m.userData.baseTransparent; m.depthWrite = !m.userData.baseTransparent;
    }
  });
}
async function beamIn(it, at, scale) {
  const n = it.node; n.position.copy(at); n.scale.setScalar(scale); it.spin.rotation.set(0, 0, 0);
  setFade(it, 0); n.visible = true;
  const h = it.height * scale, r = Math.max(0.12, h * 0.45);
  const glow = shimmer(at.clone(), h * 1.25, r, 2.8);
  await tween(2.2, t => { const f = ease(Math.min(1, Math.max(0, (t - 0.2) / 0.8))); setFade(it, f); n.scale.setScalar(scale * (0.96 + 0.04 * f)); });
  setFade(it, 1);
  return glow;
}
async function beamOut(it) {
  const n = it.node, s = n.scale.x, h = it.height * s;
  shimmer(n.position.clone(), h * 1.25, Math.max(0.1, h * 0.45), 2.4);
  await tween(1.8, t => setFade(it, 1 - ease(Math.min(1, t / 0.9))));
  n.visible = false; setFade(it, 1);
}

// a very gentle hint: the tile (and its letter) lifts a few millimetres, rocks a touch and settles
// the shown object's name, top left (follows the capitals / small letters switch)
const nameEl = document.getElementById('objname');
var shownWord = '';   // var: the case switch can read it before this line runs
function showName(w) {
  shownWord = w;
  if (!w) { nameEl.classList.remove('on'); return; }
  nameEl.textContent = lowerCase ? w.toLowerCase() : w.toUpperCase();
  nameEl.classList.add('on');
}
function nudge(ch) {
  const parts = ['tile_', 'upper_', 'lower_'].map(k => board.getObjectByName(k + ch));
  const base = parts.map(o => ({ y: o.position.y, rz: o.rotation.z }));
  return tween(1.6, t => parts.forEach((o, i) => {
    o.position.y = base[i].y + 0.03 * Math.sin(Math.PI * t);
    o.rotation.z = base[i].rz + 0.035 * Math.sin(2 * Math.PI * t) * (1 - t);
  }));
}

// ---------------- game flow ----------------
let state = 'idle';           // idle | busy | waiting | dragging
let current = null, tries = 0, lastActive = 0, clock = 0;
let queue = [];
// ---------------- the pad (shimmer mode): a soft round platform she presses ----------------
// the pad sits on the board itself, in the corner left free beside the two bottom rows (O-T, U-Z)
// it is part of the board: bigger, and poking out past the board's left edge so it covers no letters
const PAD_SCALE = 0.85, PAD_R = 0.47 * PAD_SCALE;
const PAD_AT = new THREE.Vector3(slots.O.x - 0.2 - PAD_R - 0.03, BOARD_AT.y + 0.095, (slots.O.z + slots.U.z) / 2 + SLOT_TO_TILE);
const pad = new THREE.Group(); pad.position.copy(PAD_AT); pad.scale.setScalar(PAD_SCALE); scene.add(pad);
{ // a wooden plinth under the pad, matching the board's frame, so the part that sticks out stands on the table
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R + 0.025, PAD_R + 0.04, PAD_AT.y, 64),
    new THREE.MeshStandardMaterial({ color: '#d6c29c', roughness: 0.7 }));
  plinth.position.set(PAD_AT.x, PAD_AT.y / 2, PAD_AT.z); plinth.castShadow = plinth.receiveShadow = true;
  pad.userData.plinth = plinth; scene.add(plinth);
}
const PAD_TOP = 0.11;
{
  const mat = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.47, 0.08, 64), mat('#9fbfa8')); base.position.y = 0.04;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.022, 16, 96), new THREE.MeshStandardMaterial({ color: '#f6e7c4', emissive: '#ffd98a', emissiveIntensity: 0.3, roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.085;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 64), mat('#f1ead9', 0.5)); top.position.y = 0.095;
  for (const m of [base, rim, top]) { m.castShadow = m.receiveShadow = true; pad.add(m); }
  Object.assign(pad.userData, { rim, top });
}
function applyRevealMode() { const beam = cam().reveal === 'beam'; pad.visible = beam; pad.userData.plinth.visible = beam; box.visible = !beam; fit(); }
applyRevealMode();
function pressPad() {   // the top dips a little under her finger and springs back
  const top = pad.userData.top;
  return tween(0.5, t => { top.position.y = 0.095 - 0.018 * Math.sin(Math.PI * t); });
}
newRound();

async function reveal() {
  state = 'busy';
  await roundReady;
  const next = queue.pop();
  current = next.node ? next : await getItem(next);   // box mode queues loaded items, shimmer mode queues names
  if (!round.includes(current)) round.push(current);
  if (queue.length) getItem(queue[queue.length - 1].node ? OBJECTS.find(o => o.name === queue[queue.length - 1].name) : queue[queue.length - 1]);   // preload the next one
  tries = 0;
  const n = current.node;
  if (cam().reveal === 'beam') {   // shimmer into view on the pad
    pressPad();
    await beamIn(current, shownPos(current), revealScale());
    showName(current.word); say(current.word); state = 'waiting'; return;
  }
  // the lid swings fully open (felt flaps part too), the object eases up and out, then the lid closes
  flapsTo(1, 0.9);
  await Promise.all([play('open'), moveTo(n, holeBelow.clone().setY(holeBelow.y - 0.05), pileScale(current), 1.0)]);
  { const sp = current.spin, r0 = sp.rotation.y, r1 = Math.round(r0 / (2 * Math.PI)) * 2 * Math.PI;   // face its set-up angle as it comes out
    tween(1.4, t => { sp.rotation.y = r0 + (r1 - r0) * ease(t); }); }
  await moveTo(n, shownPos(current), revealScale(), 1.4);
  flapsTo(0, 1.0); play('close');
  showName(current.word); say(current.word);
  state = 'waiting';
}
const shownPos = it => cam().reveal === 'beam'
  ? PAD_AT.clone().setY(PAD_AT.y + PAD_TOP * PAD_SCALE + 0.02)                  // standing on the pad
  : revealPoint.clone().add(new THREE.Vector3(0, 0.18 - it.height * revealScale() / 2, 0));

async function drop() {
  state = 'busy';
  const it = current, n = it.node;
  let best = null, bestD = DROP_RADIUS;
  for (const [ch, p] of Object.entries(slots)) {
    const d = Math.hypot(p.x - dragTarget.x, p.z - dragTarget.z);
    if (d < bestD) { best = ch; bestD = d; }
  }
  for (const t of Object.values(tiles)) t.target = 0;
  if (best === it.letter) {
    const sp = it.spin, r0 = sp.rotation.y, r1 = Math.round(r0 / (2 * Math.PI)) * 2 * Math.PI;   // settle at its set-up angle
    tween(0.7, t => { sp.rotation.y = r0 + (r1 - r0) * ease(t); });
    await moveTo(n, slots[best], PLACED_SCALE, 0.7, 0.1);
    it.placed = true; current = null; showName('');
    say(`${it.letter}. ${it.word}`);
    await wait(0.4);
    if (round.filter(i => i.placed).length >= roundTotal) return finish();
    state = 'idle'; lastActive = clock;
  } else {
    tries++;
    nudge(it.letter);   // the right tile gives a tiny, slow lift-and-settle
    await moveTo(n, shownPos(it), revealScale(), 1.0, 0.35);
    if (tries >= 2) tiles[it.letter].target = 1;   // gentle prompt: the right letter softly glows
    say(it.word);
    state = 'waiting';
  }
}

async function finish() {
  state = 'busy';
  await wait(2.5);
  if (cam().reveal === 'beam') {   // everything softly shimmers away, then a fresh set is ready
    await Promise.all(round.map(it => beamOut(it)));
    round.forEach(it => { it.placed = false; });
    await newRound(); state = 'idle'; lastActive = clock; return;
  }
  // everything goes back in through the felt, then a fresh set is waiting inside
  flapsTo(1, 0.8); await play('open');
  for (const it of round) {
    await moveTo(it.node, aboveBox, pileScale(it), 1.0, 0.25);
    await moveTo(it.node, holeBelow.clone().setY(PILE_FLOOR + 0.05), pileScale(it), 0.7);
    it.node.visible = false; it.placed = false;
  }
  flapsTo(0, 1.0); await play('close');
  await newRound();
  state = 'idle'; lastActive = clock;
}

// ---------------- input ----------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
// the finger picks a spot on the board surface; the object hovers just above that spot
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.07);
const dragTarget = new THREE.Vector3();   // spot on the board under the finger
const holdPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), holdHit = new THREE.Vector3();
let dragY = DRAG_Y;
const overBox = p => Math.abs(p.x - BOX_AT.x) < 0.6 && Math.abs(p.z - BOX_AT.z) < 0.6;
function pointer(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function screenDist(e, worldPos) {
  const r = canvas.getBoundingClientRect(), v = worldPos.clone().project(camera);
  return Math.hypot((v.x + 1) / 2 * r.width + r.left - e.clientX, (1 - v.y) / 2 * r.height + r.top - e.clientY);
}
// touching an object already on its letter makes it turn round once: slow, faster, slow
function spinPlaced(it) {
  if (it.spinning) return;
  it.spinning = true; const n = it.spin, r0 = n.rotation.y;
  tween(1.6, t => { n.rotation.y = r0 + 2 * Math.PI * ease(t); }).then(() => { n.rotation.y = r0; it.spinning = false; });
}
canvas.addEventListener('pointerdown', e => {
  pointer(e); lastActive = clock;
  if (state === 'idle' || state === 'waiting') {
    const placed = round.find(it => it.placed && it.node.visible && ray.intersectObject(it.node, true).length > 0);
    if (placed && !(current && ray.intersectObject(current.node, true).length > 0)) { spinPlaced(placed); return; }
  }
  if (state === 'idle') {
    const target = cam().reveal === 'beam' ? pad : box;
    const hitBox = ray.intersectObject(target, true).length > 0 || screenDist(e, cam().reveal === 'beam' ? PAD_AT.clone().setY(PAD_AT.y + 0.05) : BOX_AT.clone().setY(0.4)) < 90;
    if (hitBox) reveal();
  } else if (state === 'waiting' && current) {
    const centre = current.node.position.clone().setY(current.node.position.y + current.height * current.node.scale.x / 2);
    if (ray.intersectObject(current.node, true).length > 0 || screenDist(e, centre) < 90) {
      state = 'dragging'; canvas.setPointerCapture(e.pointerId);
      ray.ray.intersectPlane(dragPlane, dragTarget);
      dragY = current.node.position.y;
    } else {
      // tapping a letter tile also works: the object glides over to it, then drops as if dragged
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(dragPlane, hit)) {
        const ch = Object.keys(slots).find(k => Math.abs(hit.x - slots[k].x) < 0.2 && Math.abs(hit.z - (slots[k].z + SLOT_TO_TILE)) < 0.25);
        if (ch) tapTo(ch);
      }
    }
  }
});
async function tapTo(ch) {
  state = 'busy';
  dragTarget.copy(slots[ch]);
  tiles[ch].target = tries >= 2 && ch === current.letter ? 1 : 0.6;
  await moveTo(current.node, slots[ch].clone().setY(DRAG_Y), revealScale(), 0.9, 0.2);
  drop();
}
canvas.addEventListener('pointermove', e => {
  if (state !== 'dragging') return;
  pointer(e);
  ray.ray.intersectPlane(dragPlane, dragTarget);
});
const endDrag = e => { if (state === 'dragging') { try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} drop(); } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---------------- loop ----------------
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.05); last = now; clock += dt;
  mixer.update(dt); updateShimmers(dt);
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt / tw.seconds; tw.step(Math.min(tw.t, 1));
    if (tw.t >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
  if (state === 'dragging' && current) {
    const n = current.node;
    const s = n.scale.x + (revealScale() - n.scale.x) * Math.min(1, dt * 6); n.scale.setScalar(s);
    const wantY = overBox(n.position) || overBox(dragTarget) ? 0.68 : DRAG_Y;
    dragY += (wantY - dragY) * Math.min(1, dt * 6);
    // put the object's middle on the finger's line of sight, so it never jumps away from the finger
    const mid = current.height * s / 2;
    holdPlane.constant = -(dragY + mid);
    if (ray.ray.intersectPlane(holdPlane, holdHit)) {
      n.position.x += (holdHit.x - n.position.x) * Math.min(1, dt * 16);
      n.position.z += (holdHit.z - n.position.z) * Math.min(1, dt * 16);
    }
    n.position.y = dragY;
    // softly brighten the tile the object is over
    let over = null, bestD = DROP_RADIUS;
    for (const [ch, p] of Object.entries(slots)) {
      const d = Math.hypot(p.x - dragTarget.x, p.z - dragTarget.z);
      if (d < bestD) { over = ch; bestD = d; }
    }
    for (const [ch, t] of Object.entries(tiles)) if (!(tries >= 2 && ch === current.letter)) t.target = ch === over ? 0.6 : 0;
  }
  for (const [ch, t] of Object.entries(tiles)) {
    const pulse = tries >= 2 && current && ch === current.letter && t.target === 1 ? 0.55 + 0.25 * Math.sin(clock * 2) : t.target * 0.5;
    t.glow += (pulse - t.glow) * Math.min(1, dt * 4);
    for (const m of t.mats) m.emissiveIntensity = t.glow * 0.45;
  }
  // the shown object turns slowly so it can be seen from all sides; it holds still while carried
  if (current && current.node.visible && state !== 'dragging' && !current.placed) current.spin.rotation.y += dt * 2 * Math.PI / SPIN_SECONDS;
  // the pad's rim breathes softly; a little brighter while it's waiting to be pressed
  pad.userData.rim.material.emissiveIntensity = (state === 'idle' ? 0.35 : 0.15) + 0.2 * (0.5 + 0.5 * Math.sin(clock * 1.6));
  if (state === 'idle' && clock - lastActive > HINT_EVERY && cam().reveal === 'box') {   // the felt stirs a little, inviting a tap
    lastActive = clock; flapsTo(0.12, 0.8).then(() => state === 'idle' && flapsTo(0, 1.0));
  }
  // every side-on object floats softly up and down, each at its own pace
  for (const it of allItems) if (it.node.visible) it.lift.position.y = it.liftBase + BOB * Math.sin(clock * 0.9 + it.letter.charCodeAt(0)) * Math.sin(cam().tilt * DEG);
  updateFlags(dt);
  renderer.render(scene, camera);
});

// ---------------- letter flags: when a placed object hides a letter from the camera, a small flag shows it ----------------
// After things settle, each letter is checked by casting rays from the camera to points across it. If objects on the
// board block a third or more of them, a little flag with that letter rises at a corner of its space that the camera
// can see. It folds away again when the letter is clear (objects leave at the end of a round).
const flagTex = {}, flags = {};
function flagTexture(ch) {
  const key = (lowerCase ? 'l' : 'u') + ch;
  if (flagTex[key]) return flagTex[key];
  const c = document.createElement('canvas'); c.width = 160; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f7efdc'; g.beginPath(); g.roundRect(4, 4, 152, 120, 22); g.fill();
  g.strokeStyle = '#d9c9a4'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#45506a'; g.font = '700 92px system-ui, -apple-system, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(lowerCase ? ch.toLowerCase() : ch, 80, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return flagTex[key] = t;
}
const POLE_H = 0.42, FLAG_W = 0.2, FLAG_H = 0.16;
function makeFlag(ch) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, POLE_H, 10), new THREE.MeshStandardMaterial({ color: '#b98d5e', roughness: 0.6 }));
  pole.position.y = POLE_H / 2; pole.castShadow = true; g.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), new THREE.MeshStandardMaterial({ color: '#e9c46a', roughness: 0.4 }));
  knob.position.y = POLE_H + 0.005; g.add(knob);
  // the flag itself always faces the camera, so the letter is never squashed by the view from above
  const card = new THREE.Mesh(new THREE.PlaneGeometry(FLAG_W, FLAG_H), new THREE.MeshBasicMaterial({ map: flagTexture(ch), transparent: true, toneMapped: false }));
  const holder = new THREE.Group(); holder.position.y = POLE_H - FLAG_H / 2 - 0.01; holder.add(card); card.position.x = FLAG_W / 2 + 0.008;
  g.add(holder);
  g.scale.set(1, 0.001, 1); g.visible = false; scene.add(g);
  return flags[ch] = { g, card, holder, show: 0, want: 0 };
}
const letterMesh = ch => board.getObjectByName((lowerCase ? 'lower_' : 'upper_') + ch);
const flagRay = new THREE.Raycaster();
function blockers() { return allItems.filter(it => it.node.visible && (it.placed || state === 'setup')); }
function hiddenShare(points, blocks) {
  let hidden = 0; const camPos = camera.position;
  for (const p of points) {
    const dir = p.clone().sub(camPos), dist = dir.length(); dir.normalize();
    flagRay.set(camPos, dir); flagRay.far = dist - 0.01;
    for (const b of blocks) {
      if (!flagRay.ray.intersectsBox(b.box)) continue;
      if (flagRay.intersectObject(b.node, true).length) { hidden++; break; }
    }
  }
  return hidden / points.length;
}
// screen rectangles (pixels) of every other letter, and of a flag's card, to keep flags off other letters
function screenRect(points) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of points) { const v = p.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  return { x0, y0, x1, y1 };
}
function letterRects(except) {
  const out = [];
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (c === except) continue;
    const b = new THREE.Box3().setFromObject(letterMesh(c)), pts = [];
    for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, b.max.y, z));
    out.push(screenRect(pts));
  }
  return out;
}
function flagRect(base, side) {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const c = base.clone().setY(base.y + POLE_H - FLAG_H / 2).addScaledVector(right, side * (FLAG_W / 2 + 0.008));
  return screenRect([-1, 1].flatMap(a => [-1, 1].map(b => c.clone().addScaledVector(right, a * FLAG_W / 2).addScaledVector(up, b * FLAG_H / 2))));
}
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
function checkFlags() {
  const blocks = blockers().map(it => ({ node: it.node, box: new THREE.Box3().setFromObject(it.node) }));
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const f = flags[ch];
    if (!blocks.length) { if (f) f.want = 0; continue; }
    const bb = new THREE.Box3().setFromObject(letterMesh(ch)), pts = [];
    for (const u of [0.15, 0.38, 0.62, 0.85]) for (const w of [0.2, 0.5, 0.8])
      pts.push(new THREE.Vector3(bb.min.x + (bb.max.x - bb.min.x) * u, bb.max.y, bb.min.z + (bb.max.z - bb.min.z) * w));
    const hidden = hiddenShare(pts, blocks) >= 0.3;
    if (!hidden) { if (f) f.want = 0; continue; }
    const fl = f || makeFlag(ch);
    if (!fl.want) {   // choose the spot where the flag is best seen and covers no other letter
      const cz = slots[ch].z + SLOT_TO_TILE, rects = letterRects(ch);
      let best = null;
      for (const [dx, dz] of [[-0.17, -0.21], [0.17, -0.21], [-0.19, 0], [0.19, 0], [0.17, 0.2], [-0.17, 0.2]]) for (const side of [1, -1]) {
        const base = new THREE.Vector3(slots[ch].x + dx, BOARD_AT.y + 0.095, cz + dz);
        const r = flagRect(base, side), mid = base.clone().setY(base.y + POLE_H - FLAG_H / 2);
        const cardMid = mid.clone().add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(side * (FLAG_W / 2 + 0.008)));
        const score = 2 * hiddenShare([cardMid, mid], blocks) + rects.reduce((a, q) => a + overlap(r, q), 0) / ((r.x1 - r.x0) * (r.y1 - r.y0));
        if (!best || score < best.score) best = { base, side, score };
      }
      fl.g.position.copy(best.base); fl.side = best.side;
      fl.card.position.x = best.side * (FLAG_W / 2 + 0.008);
      fl.card.material.map = flagTexture(ch); fl.card.material.needsUpdate = true;
    }
    fl.want = 1;
  }
}
let flagSig = '', flagDue = 0;
function updateFlags(dt) {
  // re-check a moment after what's on the board (or the view) changes, once objects have settled
  const sig = blockers().map(it => it.name).join() + '|' + lowerCase + '|' + camera.position.toArray().map(v => v.toFixed(2)).join();
  const now = performance.now() / 1000;   // real time, so slow frames don't delay it
  if (sig !== flagSig) { flagSig = sig; flagDue = now + 1.4; }
  if (flagDue && now >= flagDue) { flagDue = 0; checkFlags(); }
  for (const f of Object.values(flags)) {
    f.show += (f.want - f.show) * Math.min(1, dt * 2.2);
    const k = ease(f.show);
    f.g.visible = f.show > 0.01; f.g.scale.set(1, Math.max(0.001, k), 1);
    f.card.material.opacity = k;
    f.holder.quaternion.copy(camera.quaternion);   // face the camera
  }
}

// read-only hook for automated tests
window.__mb = { get state() { return state; }, get current() { return current && current.letter; },
  screenOf(v) { const p = v.clone().project(camera), r = canvas.getBoundingClientRect();
    return { x: (p.x + 1) / 2 * r.width + r.left, y: (1 - p.y) / 2 * r.height + r.top }; },
  slotScreen(ch) { return this.screenOf(slots[ch]); },
  currentScreen() { const n = current.node; return this.screenOf(n.position.clone().setY(n.position.y + current.height * n.scale.x / 2)); },
  boxScreen() { return this.screenOf(cam().reveal === 'beam' ? PAD_AT.clone().setY(PAD_AT.y + 0.05) : BOX_AT.clone().setY(0.4)); } };
window.__mb.debugFlaps = () => flaps.map(f => { const v = f.getWorldPosition(new THREE.Vector3()); return [f.name, f.parent && f.parent.name, +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; });

// ---------------- setup mode (long-press the faint gear, so a child won't open it by accident) ----------------
// Every object sits in its letter slot. Tap one to pick it, then set its size, turn, tilt and lift.
const gear = document.getElementById('gear'), panel = document.getElementById('panel');
const pickName = document.getElementById('pickName'), controls = document.getElementById('controls');
let pressTimer = null, picked = null, setupItems = [];
gear.addEventListener('pointerdown', () => { pressTimer = setTimeout(enterSetup, 800); });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) gear.addEventListener(ev, () => clearTimeout(pressTimer));
const FIELDS = [
  ['size', 'Size', 0.4, 2.5, 0.05, v => v.toFixed(2)],
  ['turn', 'Turn', 0, 360, 1, v => v + '°'],
  ['tiltX', 'Tilt fwd/back', -90, 90, 1, v => v + '°'],
  ['tiltZ', 'Tilt sideways', -90, 90, 1, v => v + '°'],
  ['lift', 'Lift', -0.1, 0.2, 0.005, v => v.toFixed(3)],
  ['offX', 'Left/right', -0.2, 0.2, 0.005, v => v.toFixed(3)],
  ['offZ', 'Back/front', -0.2, 0.2, 0.005, v => v.toFixed(3)],
];
async function enterSetup() {
  if (state === 'setup') return;
  state = 'setup'; current = null; tweens.length = 0; setFlaps(0);
  for (const t of Object.values(tiles)) t.target = 0;
  for (const p of Object.values(loaded)) p.then(it => { it.node.visible = false; });
  setupItems = await Promise.all(OBJECTS.map(getItem));
  for (const it of setupItems) {
    // letters with two objects show them side by side in the slot
    const same = setupItems.filter(i => i.letter === it.letter), k = same.indexOf(it);
    const dx = same.length > 1 ? (k - (same.length - 1) / 2) * 0.22 : 0;
    it.node.visible = true; it.node.position.copy(slots[it.letter]).add(new THREE.Vector3(dx, 0, 0));
    it.node.scale.setScalar(PLACED_SCALE * (same.length > 1 ? 0.75 : 1)); it.spin.rotation.set(0, 0, 0);
  }
  pick(null); showTab('object'); panel.hidden = false;
}
function pick(it) {
  picked = it;
  for (const [ch, t] of Object.entries(tiles)) t.target = it && ch === it.letter ? 0.6 : 0;
  pickName.textContent = it ? `${it.letter}  ${it.word}` : 'Tap an object on the board';
  controls.innerHTML = '';
  if (!it) return;
  const c = setupOf(it.name);
  for (const [key, label, min, max, step, fmt] of FIELDS) {
    const row = document.createElement('label'); row.className = 'row';
    row.innerHTML = `<span class="nm">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${c[key]}"><span class="val">${fmt(c[key])}</span>`;
    const input = row.querySelector('input'), val = row.querySelector('.val');
    input.addEventListener('input', () => {
      const v = +input.value; val.textContent = fmt(v);
      setup[it.name] = { ...(setup[it.name] || {}), [key]: v }; saveSetup(); applySetup(it);
    });
    controls.appendChild(row);
  }
}
// in setup, a tap on the board picks the object in (or nearest to) that slot
canvas.addEventListener('pointerdown', e => {
  if (state !== 'setup') return;
  pointer(e);
  const hitObj = setupItems.find(it => ray.intersectObject(it.node, true).length > 0);
  if (tab === 'camera') showTab('object');
  if (hitObj) return pick(hitObj);
  const hit = new THREE.Vector3();
  if (ray.ray.intersectPlane(dragPlane, hit)) {
    const ch = Object.keys(slots).find(k => Math.abs(hit.x - slots[k].x) < 0.2 && Math.abs(hit.z - (slots[k].z + SLOT_TO_TILE)) < 0.25);
    const it = ch && setupItems.find(i => i.letter === ch);
    if (it) pick(it);
  }
});
document.getElementById('resetOne').addEventListener('click', () => {
  if (tab === 'camera') { camSet = {}; saveCam(); fit(); return showTab('camera'); }
  if (!picked) return;
  delete setup[picked.name]; saveSetup(); applySetup(picked); pick(picked);
});
document.getElementById('resetAll').addEventListener('click', () => {
  setup = {}; saveSetup(); setupItems.forEach(applySetup);
  camSet = {}; saveCam(); fit(); showTab(tab);
});
document.getElementById('copySetup').addEventListener('click', async () => {
  const changed = Object.fromEntries(OBJECTS.map(o => [o.name, setupOf(o.name)])
    .filter(([, c]) => Object.keys(BLANK).some(k => c[k] !== BLANK[k])));
  const text = JSON.stringify({ objects: changed, camera: cam() });
  document.getElementById('setupOut').value = text;
  try { await navigator.clipboard.writeText(text); } catch (e) {}
});
const CAM_FIELDS = [
  ['tilt', 'Tilt', 25, 89, 1, v => v + '°'],
  ['turn', 'Turn', -60, 60, 1, v => v + '°'],
  ['zoom', 'Zoom', 0.6, 2, 0.01, v => v.toFixed(2)],
  ['panX', 'Left/right', -2, 2, 0.01, v => v.toFixed(2)],
  ['panZ', 'Up/down', -1.5, 1.5, 0.01, v => v.toFixed(2)],
  ['shown', 'Shown size', 0.6, 2.6, 0.05, v => v.toFixed(2)],
  ['perRound', 'Objects per round', 3, 26, 1, v => String(v)],
];
let tab = 'object';
function showTab(t) {
  tab = t;
  document.getElementById('tabObject').classList.toggle('on', t === 'object');
  document.getElementById('tabCamera').classList.toggle('on', t === 'camera');
  if (t === 'object') return pick(picked);
  for (const tt of Object.values(tiles)) tt.target = 0;
  pickName.textContent = 'View';
  controls.innerHTML = '';
  const c = cam();
  for (const [key, label, min, max, step, fmt] of CAM_FIELDS) {
    const row = document.createElement('label'); row.className = 'row';
    row.innerHTML = `<span class="nm">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${c[key]}"><span class="val">${fmt(c[key])}</span>`;
    const input = row.querySelector('input'), val = row.querySelector('.val');
    input.addEventListener('input', () => { const v = +input.value; val.textContent = fmt(v); camSet[key] = v; saveCam(); fit(); });
    controls.appendChild(row);
  }
  // how objects appear: shimmer onto the pad, or lifted out of the box
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<span class="nm">Appear by</span><span><button data-v="beam">Pad</button> <button data-v="box">Box</button></span><span></span>`;
  for (const btn of row.querySelectorAll('button')) {
    btn.className = c.reveal === btn.dataset.v ? 'on' : '';
    btn.addEventListener('click', () => { camSet.reveal = btn.dataset.v; saveCam(); applyRevealMode(); showTab('camera'); });
  }
  controls.appendChild(row);
}
document.getElementById('tabObject').addEventListener('click', () => showTab('object'));
document.getElementById('tabCamera').addEventListener('click', () => showTab('camera'));
document.getElementById('flipPanel').addEventListener('click', () => panel.classList.toggle('right'));
document.getElementById('closePanel').addEventListener('click', async () => {
  panel.hidden = true; pick(null);
  for (const it of setupItems) it.node.visible = false;
  state = 'busy';
  await newRound();          // back to the game with a fresh set in the box
  state = 'idle'; lastActive = clock;
});
window.__mb.tileScreen = ch => window.__mb.screenOf(slots[ch].clone().setZ(slots[ch].z + 2 * SLOT_TO_TILE));
window.__mb.dbgShadow = () => { const it = current; if (!it) return null; let n = 0, withDepth = 0, uv = 0;
  it.node.traverse(o => { if (o.isMesh) { n++; if (o.customDepthMaterial) withDepth++; if (o.geometry.attributes.uv) uv++; } });
  return { n, withDepth, uv, fade: it.shadowFade && it.shadowFade.value, cast: (() => { let c = []; it.node.traverse(o => o.isMesh && c.push(o.castShadow)); return c; })() }; };
window.__mb.placedScreen = () => { const it = round.find(i => i.placed); return it ? window.__mb.screenOf(it.node.position.clone().setY(0.12)) : null; };
window.__mb.anySpinning = () => round.some(i => i.spinning);
window.__mb.flags = () => Object.entries(flags).filter(([, f]) => f.want).map(([ch]) => ch).join('');
