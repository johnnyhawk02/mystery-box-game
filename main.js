// Mystery Box: tap the box, see the object, drag it to the letter it starts with.
// Calm by design: slow eased motion, no flashing, no fail sounds. A wrong drop just floats back.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

const OBJECTS = [
  { name: 'apple', letter: 'A', word: 'apple' },
  { name: 'ball', letter: 'B', word: 'ball' },
  { name: 'cup', letter: 'C', word: 'cup' },
  { name: 'duck', letter: 'D', word: 'duck' },
  { name: 'egg', letter: 'E', word: 'egg' },
  { name: 'fish', letter: 'F', word: 'fish' },
];
const BOX_AT = new THREE.Vector3(-2.5, 0, -0.15);
const BOX_SCALE = 0.85;
const BOARD_AT = new THREE.Vector3(0, 0, -0.15);
const REVEAL_SCALE = 2.3;   // objects are shown big when they come out of the box
const DRAG_SCALE = 1.35;
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
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
const [boxG, boardG, ...objG] = await Promise.all([
  load('assets/mystery_box.glb'), load('assets/alphabet_board.glb'),
  ...OBJECTS.map(o => load(`assets/objects/${o.name}.glb`)),
]);
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

const items = OBJECTS.map((o, i) => {
  const node = new THREE.Group(); node.add(objG[i].scene); shadowy(node);
  node.visible = false; scene.add(node);
  const height = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3()).y;
  return { ...o, node, height, placed: false };
});

// ---------------- camera framing (fits any screen, incl. a phone in landscape) ----------------
const fitPoints = [];
for (const root of [box, board]) {
  const b = new THREE.Box3().setFromObject(root);
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) fitPoints.push(new THREE.Vector3(x, y, z));
}
fitPoints.push(revealPoint.clone().add(new THREE.Vector3(0, 0.4, 0)));
for (const x of [-0.4, 0.4]) fitPoints.push(BOX_AT.clone().add(new THREE.Vector3(x, 1.3, -0.5)));  // open lid
const lookAt = new THREE.Box3().setFromPoints(fitPoints).getCenter(new THREE.Vector3());
lookAt.y = 0.25;
const viewDir = new THREE.Vector3(0, 2.3, 1.0).normalize();
function fit() {
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
      const ok = fitPoints.every(p => { v.copy(p).project(camera); return Math.abs(v.x) < 0.95 && v.y < 0.84 && v.y > -0.96; });
      if (ok) hi = d; else lo = d;
    }
    place(hi);
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    for (const p of fitPoints) { v.copy(p).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const halfH = hi * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = halfH * camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    lookAt.addScaledVector(right, (x0 + x1) / 2 * halfW).addScaledVector(up, ((y0 + y1) / 2 + 0.06) * halfH);
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

// ---------------- game flow ----------------
let state = 'idle';           // idle | busy | waiting | dragging
let current = null, tries = 0, lastActive = 0, clock = 0;
let queue = shuffle(items.slice());

async function reveal() {
  state = 'busy';
  current = queue.pop(); tries = 0;
  await play('open');
  const n = current.node;
  n.position.copy(insideBox); n.scale.setScalar(0.6); n.visible = true;
  await moveTo(n, shownPos(current), REVEAL_SCALE, 1.4);
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
    await moveTo(n, slots[best], PLACED_SCALE, 0.7, 0.1);
    it.placed = true; current = null;
    say(`${it.letter}. ${it.word}`);
    await play('close');
    if (items.every(i => i.placed)) return finish();
    state = 'idle'; lastActive = clock;
  } else {
    tries++;
    await moveTo(n, shownPos(it), REVEAL_SCALE, 1.0, 0.35);
    if (tries >= 2) tiles[it.letter].target = 1;   // gentle prompt: the right letter softly glows
    say(it.word);
    state = 'waiting';
  }
}

async function finish() {
  state = 'busy';
  await wait(2.5);
  await play('open');
  for (const it of items) {
    await moveTo(it.node, aboveBox, 0.8, 1.0, 0.25);
    await moveTo(it.node, insideBox, 0.6, 0.6);
    it.node.visible = false; it.placed = false;
  }
  await play('close');
  queue = shuffle(items.slice());
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
    }
  }
});
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
  if (state === 'idle' && clock - lastActive > HINT_EVERY) { lastActive = clock; play('hint'); }
  renderer.render(scene, camera);
});

// read-only hook for automated tests
window.__mb = { get state() { return state; }, get current() { return current && current.letter; },
  screenOf(v) { const p = v.clone().project(camera), r = canvas.getBoundingClientRect();
    return { x: (p.x + 1) / 2 * r.width + r.left, y: (1 - p.y) / 2 * r.height + r.top }; },
  slotScreen(ch) { return this.screenOf(slots[ch]); },
  currentScreen() { const n = current.node; return this.screenOf(n.position.clone().setY(n.position.y + current.height * n.scale.x / 2)); },
  boxScreen() { return this.screenOf(BOX_AT.clone().setY(0.4)); } };
