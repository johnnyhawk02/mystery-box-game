// Mystery Box: tap the box, see the object, drag it to the letter it starts with.
// Calm by design: slow eased motion, no flashing, no fail sounds. A wrong drop just floats back.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

// every object the game knows; each round picks ROUND_SIZE of them with different letters
const OBJECTS = [
  { name: 'apple', letter: 'A', word: 'apple' },
  { name: 'ball', letter: 'B', word: 'ball' },
  { name: 'cup', letter: 'C', word: 'cup' },
  { name: 'duck', letter: 'D', word: 'duck' },
  { name: 'egg', letter: 'E', word: 'egg' },
  { name: 'fish', letter: 'F', word: 'fish' },
  { name: 'gloves', letter: 'G', word: 'gloves' },
  { name: 'hat', letter: 'H', word: 'hat' },
  { name: 'jug', letter: 'J', word: 'jug' },
  { name: 'kiwi', letter: 'K', word: 'kiwi' },
  { name: 'lemon', letter: 'L', word: 'lemon' },
  { name: 'onion', letter: 'O', word: 'onion' },
  { name: 'pear', letter: 'P', word: 'pear' },
  { name: 'rock', letter: 'R', word: 'rock' },
  { name: 'spoon', letter: 'S', word: 'spoon' },
  { name: 'teapot', letter: 'T', word: 'teapot' },
  { name: 'ukulele', letter: 'U', word: 'ukulele' },
  { name: 'vase', letter: 'V', word: 'vase' },
  { name: 'wateringcan', letter: 'W', word: 'watering can' },
];
const ROUND_SIZE = 6;
const SPIN_SECONDS = 7;     // one slow turn while the object waits to be dragged
const BOX_AT = new THREE.Vector3(-2.2, 0, 0.62);   // bottom-left, so the shown object has open space above it
const BOX_SCALE = 0.85;
const BOARD_AT = new THREE.Vector3(0, 0, -0.15);
const REVEAL_SCALE = 2.3;   // objects are shown big when they come out of the box
const DRAG_SCALE = REVEAL_SCALE;   // stays big while carried; shrinks only when it settles in its slot
const PLACED_SCALE = 1.2;  // a little bigger in the slot so it's easy to see
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
  if (!soundOn) speechSynthesis?.cancel();
});
function say(text) {
  if (!soundOn || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.8; u.pitch = 1.05; u.lang = 'en-GB';
  speechSynthesis.speak(u);
}
document.getElementById('full').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); }
  } catch (e) {}
});

// ---------------- load models ----------------
const loader = new GLTFLoader();
// the page passes its version (main.js?v=…) so a new release never mixes with cached old models
const V = new URL(import.meta.url).searchParams.get('v') || '';
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
}
showCase();
caseBtn.addEventListener('click', () => {
  lowerCase = !lowerCase; showCase();
  try { localStorage.setItem('mb-case', lowerCase ? 'lower' : 'upper'); } catch (e) {}
});

// ---------------- grown-ups' setup: size, turn, tilt and lift per object ----------------
// SETUP_DEFAULTS can be filled from the setup panel's "Copy" output to make them the same on every device.
// Johnny's settings from 2026-11-21. Bump DEFAULTS_ID when these change: devices then drop their own
// saved tweaks so everyone starts from the same defaults.
const DEFAULTS_ID = '2026-11-21b';
try { if (localStorage.getItem('mb-defaults') !== DEFAULTS_ID) {
  localStorage.removeItem('mb-setup'); localStorage.removeItem('mb-sizes'); localStorage.removeItem('mb-camera');
  localStorage.setItem('mb-defaults', DEFAULTS_ID);
} } catch (e) {}
const SETUP_DEFAULTS = {
  apple: {size: 1.5, turn: 0, tiltX: 0, tiltZ: 0, lift: 0},
  ball: {size: 1.9, turn: 0, tiltX: 0, tiltZ: 0, lift: 0},
  cup: {size: 1.6, turn: 319, tiltX: 0, tiltZ: 0, lift: 0.035},
  duck: {size: 1.25, turn: 0, tiltX: 0, tiltZ: 0, lift: 0},
  egg: {size: 1.45, turn: 0, tiltX: 0, tiltZ: 0, lift: 0},
  fish: {size: 1.2, turn: 320, tiltX: 0, tiltZ: 0, lift: 0},
  gloves: {size: 1.55, turn: 0, tiltX: 0, tiltZ: 0, lift: 0.05},
  hat: {size: 1.65, turn: 0, tiltX: -19, tiltZ: 0, lift: 0.05},
  jug: {size: 1.7, turn: 0, tiltX: 0, tiltZ: 0, lift: 0},
  kiwi: {size: 1.45, turn: 0, tiltX: 0, tiltZ: 0, lift: 0},
  lemon: {size: 1.5, turn: 0, tiltX: 0, tiltZ: 0, lift: 0},
  onion: {size: 1.7, turn: 0, tiltX: 0, tiltZ: 0, lift: 0},
  pear: {size: 1.3, turn: 0, tiltX: -10, tiltZ: 0, lift: 0.055},
  rock: {size: 1.15, turn: 66, tiltX: 0, tiltZ: 0, lift: 0.045},
  spoon: {size: 1.35, turn: 52, tiltX: 0, tiltZ: 0, lift: 0.05},
  teapot: {size: 1.5, turn: 0, tiltX: 0, tiltZ: 0, lift: 0},
  ukulele: {size: 1.8, turn: 0, tiltX: -3, tiltZ: 1, lift: 0.145},
  vase: {size: 1.6, turn: 0, tiltX: -3, tiltZ: 0, lift: 0},
  wateringcan: {size: 1.9, turn: 314, tiltX: 0, tiltZ: 0, lift: 0.04},
};
const BLANK = { size: 1, turn: 0, tiltX: 0, tiltZ: 0, lift: 0 };
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
function applySetup(it) {
  const c = setupOf(it.name);
  it.inner.scale.setScalar(c.size);
  it.inner.rotation.set(c.tiltX * DEG, c.turn * DEG, c.tiltZ * DEG, 'YXZ');
  it.inner.position.y = c.lift;
}

// objects load only when a round needs them, so the game starts fast on a phone
const loaded = {};
function getItem(o) {
  return loaded[o.name] ??= load(`assets/objects/${o.name}.glb`).then(g => {
    // node is moved and scaled by the game; inner carries the grown-ups' size setting for this object
    const node = new THREE.Group(), inner = new THREE.Group(); inner.add(g.scene); node.add(inner); shadowy(node);
    node.visible = false; scene.add(node);
    const baseHeight = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3()).y;
    const it = { ...o, node, inner, baseHeight, placed: false, get height() { return this.baseHeight * sizeOf(this.name); } };
    applySetup(it); return it;
  });
}
let round = [], roundReady = null;
function newRound() {
  const picks = shuffle(OBJECTS.slice()).slice(0, ROUND_SIZE);
  roundReady = Promise.all(picks.map(getItem)).then(r => { round = r; queue = shuffle(r.slice()); fillPile(r); });
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
const CAMERA_DEFAULTS = {tilt: 49, turn: 0, zoom: 1, panX: 0, panZ: 0};   // zoom/pan reset when the box moved to the bottom-left
const CAM_BLANK = { tilt: 66, turn: 0, zoom: 1, panX: 0, panZ: 0 };
let camSet = {};
try { camSet = JSON.parse(localStorage.getItem('mb-camera') || '{}'); } catch (e) {}
const cam = () => ({ ...CAM_BLANK, ...CAMERA_DEFAULTS, ...camSet });
function saveCam() { try { localStorage.setItem('mb-camera', JSON.stringify(camSet)); } catch (e) {} }
const viewDir = new THREE.Vector3();
const baseLook = lookAt.clone();
function fit() {
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
function fillPile(items) {
  const spots = shuffle([[-0.16, -0.12], [0, -0.14], [0.16, -0.1], [-0.15, 0.12], [0.02, 0.13], [0.17, 0.12]]);
  items.forEach((it, i) => {
    const [x, z] = spots[i % spots.length];
    it.pileAt = BOX_AT.clone().add(new THREE.Vector3(x + (Math.random() - 0.5) * 0.04, PILE_FLOOR + (i % 2) * 0.03, z));
    it.node.position.copy(it.pileAt); it.node.rotation.set(0, Math.random() * Math.PI * 2, 0);
    it.node.scale.setScalar(0.85); it.node.visible = true; it.placed = false;
  });
}

// a very gentle hint: the tile (and its letter) lifts a few millimetres, rocks a touch and settles
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
newRound();

async function reveal() {
  state = 'busy';
  await roundReady;
  current = queue.pop(); tries = 0;
  const n = current.node;
  // ease up out of the jumble to just under the felt, then up through the flaps
  await moveTo(n, holeBelow.clone().setY(holeBelow.y - current.height * 0.4), 0.85, 0.7);
  flapsTo(1, 0.9);
  { const r0 = n.rotation.y, r1 = Math.round(r0 / (2 * Math.PI)) * 2 * Math.PI;   // face its set-up angle as it comes out
    tween(1.4, t => { n.rotation.y = r0 + (r1 - r0) * ease(t); }); }
  await moveTo(n, shownPos(current), REVEAL_SCALE, 1.4);
  flapsTo(0, 1.2);
  say(current.word);
  state = 'waiting';
}
const shownPos = it => revealPoint.clone().add(new THREE.Vector3(0, 0.18 - it.height * REVEAL_SCALE / 2, 0));

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
    const r0 = n.rotation.y, r1 = Math.round(r0 / (2 * Math.PI)) * 2 * Math.PI;   // settle at its set-up angle
    tween(0.7, t => { n.rotation.y = r0 + (r1 - r0) * ease(t); });
    await moveTo(n, slots[best], PLACED_SCALE, 0.7, 0.1);
    it.placed = true; current = null;
    say(`${it.letter}. ${it.word}`);
    await wait(0.4);
    if (round.every(i => i.placed)) return finish();
    state = 'idle'; lastActive = clock;
  } else {
    tries++;
    nudge(it.letter);   // the right tile gives a tiny, slow lift-and-settle
    await moveTo(n, shownPos(it), REVEAL_SCALE, 1.0, 0.35);
    if (tries >= 2) tiles[it.letter].target = 1;   // gentle prompt: the right letter softly glows
    say(it.word);
    state = 'waiting';
  }
}

async function finish() {
  state = 'busy';
  await wait(2.5);
  // everything goes back in through the felt, then a fresh set is waiting inside
  for (const it of round) {
    await moveTo(it.node, aboveBox, 0.85, 1.0, 0.25);
    flapsTo(1, 0.5);
    await moveTo(it.node, holeBelow, 0.85, 0.7);
    it.node.visible = false; it.placed = false;
    await flapsTo(0, 0.6);
  }
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
canvas.addEventListener('pointerdown', e => {
  pointer(e); lastActive = clock;
  if (state === 'idle') {
    const hitBox = ray.intersectObject(box, true).length > 0 || screenDist(e, BOX_AT.clone().setY(0.4)) < 90;
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
        const ch = Object.keys(slots).find(k => Math.abs(hit.x - slots[k].x) < 0.2 && Math.abs(hit.z - (slots[k].z + 0.085)) < 0.25);
        if (ch) tapTo(ch);
      }
    }
  }
});
async function tapTo(ch) {
  state = 'busy';
  dragTarget.copy(slots[ch]);
  tiles[ch].target = tries >= 2 && ch === current.letter ? 1 : 0.6;
  await moveTo(current.node, slots[ch].clone().setY(DRAG_Y), DRAG_SCALE, 0.9, 0.2);
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
  mixer.update(dt);
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt / tw.seconds; tw.step(Math.min(tw.t, 1));
    if (tw.t >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
  if (state === 'dragging' && current) {
    const n = current.node;
    const s = n.scale.x + (DRAG_SCALE - n.scale.x) * Math.min(1, dt * 6); n.scale.setScalar(s);
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
  if (current && current.node.visible && state !== 'dragging' && !current.placed) current.node.rotation.y += dt * 2 * Math.PI / SPIN_SECONDS;
  if (state === 'idle' && clock - lastActive > HINT_EVERY) {   // the felt stirs a little, inviting a tap
    lastActive = clock; flapsTo(0.12, 0.8).then(() => state === 'idle' && flapsTo(0, 1.0));
  }
  renderer.render(scene, camera);
});

// read-only hook for automated tests
window.__mb = { get state() { return state; }, get current() { return current && current.letter; },
  screenOf(v) { const p = v.clone().project(camera), r = canvas.getBoundingClientRect();
    return { x: (p.x + 1) / 2 * r.width + r.left, y: (1 - p.y) / 2 * r.height + r.top }; },
  slotScreen(ch) { return this.screenOf(slots[ch]); },
  currentScreen() { const n = current.node; return this.screenOf(n.position.clone().setY(n.position.y + current.height * n.scale.x / 2)); },
  boxScreen() { return this.screenOf(BOX_AT.clone().setY(0.4)); } };
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
];
async function enterSetup() {
  if (state === 'setup') return;
  state = 'setup'; current = null; tweens.length = 0; setFlaps(0);
  for (const t of Object.values(tiles)) t.target = 0;
  for (const p of Object.values(loaded)) p.then(it => { it.node.visible = false; });
  setupItems = await Promise.all(OBJECTS.map(getItem));
  for (const it of setupItems) {
    it.node.visible = true; it.node.position.copy(slots[it.letter]); it.node.scale.setScalar(PLACED_SCALE); it.node.rotation.set(0, 0, 0);
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
    const ch = Object.keys(slots).find(k => Math.abs(hit.x - slots[k].x) < 0.2 && Math.abs(hit.z - (slots[k].z + 0.085)) < 0.25);
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
];
let tab = 'object';
function showTab(t) {
  tab = t;
  document.getElementById('tabObject').classList.toggle('on', t === 'object');
  document.getElementById('tabCamera').classList.toggle('on', t === 'camera');
  if (t === 'object') return pick(picked);
  for (const tt of Object.values(tiles)) tt.target = 0;
  pickName.textContent = 'Camera';
  controls.innerHTML = '';
  const c = cam();
  for (const [key, label, min, max, step, fmt] of CAM_FIELDS) {
    const row = document.createElement('label'); row.className = 'row';
    row.innerHTML = `<span class="nm">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${c[key]}"><span class="val">${fmt(c[key])}</span>`;
    const input = row.querySelector('input'), val = row.querySelector('.val');
    input.addEventListener('input', () => { const v = +input.value; val.textContent = fmt(v); camSet[key] = v; saveCam(); fit(); });
    controls.appendChild(row);
  }
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
window.__mb.tileScreen = ch => window.__mb.screenOf(slots[ch].clone().setZ(slots[ch].z + 0.17));
