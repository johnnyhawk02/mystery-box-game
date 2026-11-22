// Talker: a first communication board. Big objects sit on pads in a fixed layout with their words under
// them; tapping one makes it rise, turn round once and say its word. A grown-up chooses which objects
// (hold the gear). The layout stays the same every time so she can learn where things are.
const V = new URL(import.meta.url).searchParams.get('v') || '';
const S = await import('./stage.js' + (V ? '?v=' + V : ''));
const { THREE, OBJECTS, store, tween, wait, ease, say, cased, letterCase, makePad, PAD_R, PAD_TOP,
        fitCamera, getItem, beamIn, beamOut, toScreen, rayFrom, onFrame, holdToOpen, objectPicker, canvas } = S;

const DEFAULT_SET = ['apple', 'football', 'duck', 'fish', 'cake', 'monkey'];
const GAP_X = 1.3, GAP_Z = 1.55;

let chosen = store.json('mb-talk-set', DEFAULT_SET);
const items = () => OBJECTS.filter(o => chosen.includes(o.name));

const labelsEl = document.getElementById('labels');
let cells = [];   // { pad, item, label, busy }
let state = 'busy', buildId = 0;
const scaleFor = n => n <= 6 ? 1.75 : n <= 12 ? 1.5 : 1.3;

// rows and columns that make the objects biggest on this screen (a wide phone prefers fewer rows)
function grid(n) {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight - 80);
  let best = null;
  for (let rows = 1; rows <= 4; rows++) {
    const cols = Math.ceil(n / rows), size = Math.min(aspect / (cols * GAP_X), 1 / (rows * GAP_Z * 0.8));
    if (!best || size > best.size * 1.08) best = { rows, cols, size };   // a clear win only, so the layout doesn't flip often
  }
  return best;
}
async function build() {
  const id = ++buildId; state = 'busy';
  // clear the old board softly
  await Promise.all(cells.map(c => c.item.node.visible ? beamOut(c.item) : null));
  for (const c of cells) { c.pad.g.removeFromParent(); c.label.remove(); }
  cells = [];
  if (id !== buildId) return;
  const list = items(), { rows, cols } = grid(list.length), scale = scaleFor(list.length);
  const loaded = await Promise.all(list.map(getItem));
  if (id !== buildId) return;
  const fitPoints = [];
  loaded.forEach((it, i) => {
    const r = Math.floor(i / cols), inRow = Math.min(cols, list.length - r * cols), c = i - r * cols;
    const at = new THREE.Vector3((c - (inRow - 1) / 2) * GAP_X, 0, (r - (rows - 1) / 2) * GAP_Z);
    const pad = makePad(at);
    const label = document.createElement('div'); label.className = 'label'; labelsEl.appendChild(label);
    cells.push({ pad, item: it, label, scale, busy: false });
    for (const dx of [-PAD_R, PAD_R]) for (const dz of [-PAD_R, PAD_R + 0.42]) fitPoints.push(at.clone().add(new THREE.Vector3(dx, 0, dz)));
    fitPoints.push(at.clone().add(new THREE.Vector3(0, 1.0 * scale / 1.75 + 0.2, 0)));
  });
  fit = () => { fitCamera(fitPoints, 52, 80); placeLabels(); };
  fit();
  showLabels();
  await Promise.all(cells.map((c, i) => wait(i * 0.15).then(() => beamIn(c.item, c.pad.g.position.clone().setY(PAD_TOP), scale))));
  if (id === buildId) state = 'ready';
}
let fit = () => {};
window.addEventListener('resize', () => fit());
function showLabels() { for (const c of cells) { c.label.textContent = cased(c.item.word); c.label.classList.add('on'); } }
letterCase.listeners.push(showLabels);
function placeLabels() {
  for (const c of cells) {
    const s = toScreen(c.pad.g.position.clone().add(new THREE.Vector3(0, 0, PAD_R + 0.08)));
    c.label.style.left = s.x + 'px'; c.label.style.top = s.y + 'px';
  }
}

// tap: the object rises, turns round once (slow-faster-slow), says its word, and settles back
async function talk(c) {
  if (c.busy) return;
  c.busy = true; say(c.item.word);
  const n = c.item.node, y0 = PAD_TOP, s0 = c.scale, r0 = n.rotation.y;
  c.pad.want = 1;
  await tween(2.2, t => {
    const up = Math.sin(Math.PI * t);
    n.position.y = y0 + 0.3 * up; n.scale.setScalar(s0 * (1 + 0.15 * up)); n.rotation.y = r0 + 2 * Math.PI * ease(t);
  });
  n.position.y = y0; n.scale.setScalar(s0); n.rotation.y = r0;
  c.pad.want = 0; c.busy = false;
}
canvas.addEventListener('pointerdown', e => {
  if (state !== 'ready') return;
  const ray = rayFrom(e);
  let best = null, bestD = 90;
  for (const c of cells) {
    if (ray.intersectObject(c.item.node, true).length || ray.intersectObject(c.pad.g, true).length) { best = c; break; }
    const s = toScreen(c.pad.g.position.clone().setY(0.4)), d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
    if (d < bestD) { best = c; bestD = d; }
  }
  if (best) talk(best);
});
onFrame(() => {});

// ---------------- grown-ups' panel (hold the gear) ----------------
const panel = document.getElementById('panel');
holdToOpen(document.getElementById('gear'), () => {
  state = 'panel'; panel.hidden = false;
  panel.innerHTML = `<div class="head"><span>Talker: grown-ups</span><button id="done">Done</button></div>
    <h3>Objects on the board</h3><p class="note">3 to 6 is a good start. They keep the same places each time.</p><div id="pick"></div>`;
  let next = chosen;
  objectPicker(panel.querySelector('#pick'), chosen, names => { next = names; });
  panel.querySelector('#done').addEventListener('click', () => {
    panel.hidden = true;
    if (next.length && next.join() !== chosen.join()) { chosen = next; store.setJson('mb-talk-set', chosen); build(); }
    else state = 'ready';
  });
});

// read-only hook for automated tests
window.__tk = { get state() { return state; }, names: () => cells.map(c => c.item.name),
  screen: i => toScreen(cells[i].pad.g.position.clone().setY(0.4)), busy: () => cells.map(c => c.busy) };

build();
