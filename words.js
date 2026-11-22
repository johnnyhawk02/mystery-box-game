// Find the Word, errorless: the voice says "find the duck", the word is shown, and the duck glows softly
// on its pad. She starts with just one object, then two, then three; once three are easy the glow comes a
// little later each time, so she can find it on her own first. A wrong tap does nothing. No fail sounds.
const V = new URL(import.meta.url).searchParams.get('v') || '';
const S = await import('./stage.js' + (V ? '?v=' + V : ''));
const { THREE, OBJECTS, store, tween, wait, ease, shuffle, say, cased, letterCase, makePad, PAD_R, PAD_TOP,
        fitCamera, getItem, beamIn, beamOut, toScreen, rayFrom, onFrame, clock, holdToOpen, objectPicker, canvas } = S;

const SPACING = 1.5;
const SHOWN = 2.1;
const SPIN_SECONDS = 9;
// the levels she moves through: how many objects, and how long before the right one glows
const LEVELS = [
  { n: 1, delay: 0, label: '1 object' },
  { n: 2, delay: 0, label: '2 objects' },
  { n: 3, delay: 0, label: '3 objects' },
  { n: 3, delay: 2, label: '3, glow after 2s' },
  { n: 3, delay: 4, label: '3, glow after 4s' },
  { n: 3, delay: 8, label: '3, glow after 8s' },
];
const UP_AFTER = 3;    // right answers at a level (on her own, once the glow waits) before moving up
const DOWN_AFTER = 3;  // helped answers in a row (when the glow waits) before stepping back one

// ---------------- saved progress and the grown-ups' choices ----------------
let level = Math.min(LEVELS.length - 1, +(store.get('mb-words-level') || 0));
let streak = 0, helpedStreak = 0;
let chosen = store.json('mb-words-set', null);    // null = every object
const stats = store.json('mb-words-stats', {});  // per word: { own, helped }
const pool = () => { const s = chosen && OBJECTS.filter(o => chosen.includes(o.name)); return s && s.length ? s : OBJECTS; };

// ---------------- the word ----------------
const wordEl = document.getElementById('word');
let shownWord = '';
function showWord(w) {
  if (w !== undefined) shownWord = w;
  if (shownWord) wordEl.textContent = cased(shownWord);
  wordEl.classList.toggle('on', !!shownWord);
}
letterCase.listeners.push(() => showWord());
wordEl.addEventListener('pointerdown', () => shownWord && say(shownWord));

// ---------------- three pad places; one object uses the middle, two use the outer pair ----------------
const pads = [-1, 0, 1].map(i => makePad(new THREE.Vector3(i * SPACING, 0, 0)));
const placesFor = n => n === 1 ? [1] : n === 2 ? [0, 2] : [0, 1, 2];
const padTop = p => p.g.position.clone().setY(PAD_TOP);
const fitPoints = [];
for (const p of pads) {
  for (const dx of [-PAD_R, PAD_R]) for (const dz of [-PAD_R, PAD_R]) fitPoints.push(p.g.position.clone().add(new THREE.Vector3(dx, 0, dz)));
  for (const dx of [-0.45, 0.45]) fitPoints.push(p.g.position.clone().add(new THREE.Vector3(dx, 1.3, 0)));
}
// the word's box is measured with sample text so the layout never jumps between words
function fit() {
  const keep = wordEl.textContent; wordEl.textContent = 'Ag';
  const bottom = wordEl.getBoundingClientRect().bottom; wordEl.textContent = keep;
  fitCamera(fitPoints, 32, bottom + 8);
}
window.addEventListener('resize', fit);

// ---------------- rounds ----------------
let bag = [];
function choosePicks() {
  const from = pool(), n = LEVELS[level].n;
  if (!bag.length) bag = shuffle(from.slice());
  const target = bag.pop();
  // the others come from the chosen set when it's big enough, otherwise from all the objects
  const others = shuffle((from.length >= n ? from : OBJECTS).filter(o => o !== target)).slice(0, n - 1);
  return { target, all: shuffle([target, ...others]) };
}
let state = 'busy', target = null, glowAt = 0, glowing = false, helped = false, roundId = 0;
let next = choosePicks();
next.all.forEach(getItem);
async function newRound() {
  state = 'busy'; const id = ++roundId;
  let picks = next;
  if (picks.all.length !== LEVELS[level].n) picks = choosePicks();   // the level changed since it was picked
  next = choosePicks();
  const items = await Promise.all(picks.all.map(getItem));
  if (id !== roundId) return;
  next.all.forEach(getItem);
  for (const p of pads) { p.item = null; p.g.visible = false; p.want = 0; }
  const places = placesFor(items.length);
  items.forEach((it, i) => { const p = pads[places[i]]; p.item = it; p.g.visible = true; });
  target = items.find(it => it.name === picks.target.name);
  glowing = false; helped = false;
  showWord(picks.target.word);
  await wait(0.4);
  say('Find the ' + picks.target.word);
  await Promise.all(places.map((pi, i) => wait(i * 0.35).then(() => beamIn(pads[pi].item, padTop(pads[pi]), SHOWN))));
  if (id !== roundId) return;
  glowAt = clock.t + LEVELS[level].delay;
  state = 'waiting';
}
// own: found before the glow came (counts for the grown-ups' list); helped decides moving up or down
function record(own) {
  const s = stats[target.name] ??= { own: 0, helped: 0 };
  !glowing ? s.own++ : s.helped++;
  store.setJson('mb-words-stats', stats);
  const waits = LEVELS[level].delay > 0;
  if (!waits || own) { streak++; helpedStreak = 0; } else { streak = 0; helpedStreak++; }
  if (streak >= UP_AFTER && level < LEVELS.length - 1) { level++; streak = 0; }
  if (waits && helpedStreak >= DOWN_AFTER && level > 2) { level--; helpedStreak = 0; }
  store.set('mb-words-level', String(level));
}
async function found() {
  state = 'busy'; const id = roundId;
  record(!helped);
  say(target.word);
  const pad = pads.find(p => p.item === target);
  pad.want = 1;
  pads.filter(p => p.item && p.item !== target).forEach(p => beamOut(p.item).then(() => { p.g.visible = false; }));
  // the right one turns round once, slow-faster-slow, rising a little as it turns
  const n = target.node, r0 = n.rotation.y, y0 = n.position.y;
  await tween(2.0, t => { n.rotation.y = r0 + 2 * Math.PI * ease(t); n.position.y = y0 + 0.1 * Math.sin(Math.PI * t); });
  await wait(1.0);
  if (id !== roundId) return;
  showWord('');
  pad.want = 0;
  await beamOut(target);
  await wait(0.4);
  if (id === roundId) newRound();
}

// ---------------- input: only the right object answers; any other tap does nothing ----------------
const middleOf = p => padTop(p).setY(PAD_TOP + (p.item ? p.item.height * SHOWN / 2 : 0.2));
canvas.addEventListener('pointerdown', e => {
  if (state !== 'waiting') return;
  const ray = rayFrom(e), r = canvas.getBoundingClientRect();
  let best = null, bestD = Math.min(r.width / 6, 160);
  for (const p of pads) {
    if (!p.item || !p.g.visible) continue;
    if (ray.intersectObject(p.item.node, true).length || ray.intersectObject(p.g, true).length) { best = p; break; }
    const s = toScreen(middleOf(p)), d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
    if (d < bestD) { best = p; bestD = d; }
  }
  if (best && best.item === target) found();
});

onFrame(dt => {
  for (const p of pads) if (p.item && p.item.node.visible && state === 'waiting') p.item.node.rotation.y += dt * 2 * Math.PI / SPIN_SECONDS;
  if (state === 'waiting' && clock.t >= glowAt) {
    const p = pads.find(q => q.item === target);
    if (!glowing) { glowing = true; helped = LEVELS[level].delay > 0; }
    p.want = 0.75 + 0.25 * Math.sin(clock.t * 1.8);   // a slow, soft breathing glow
  }
});

// ---------------- grown-ups' panel (hold the gear) ----------------
const panel = document.getElementById('panel');
function openPanel() {
  state = 'panel'; roundId++;
  panel.hidden = false;
  panel.innerHTML = `<div class="head"><span>Words: grown-ups</span><button id="done">Done</button></div>
    <h3>Level</h3><p class="note">It moves up by itself after ${UP_AFTER} right answers, and back a step if the glow is needed ${DOWN_AFTER} times in a row.</p><div id="levels"></div>
    <h3>Objects to practise</h3><p class="note">A small set of 3 to 5 is a good start.</p><div id="pick"></div>
    <h3>Found without the glow</h3><div id="stats" class="note"></div><button id="clearStats">Clear</button>`;
  const lv = panel.querySelector('#levels');
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button'); b.textContent = `${i + 1}: ${L.label}`; b.className = i === level ? 'on' : '';
    b.addEventListener('click', () => { level = i; streak = helpedStreak = 0; store.set('mb-words-level', String(i)); [...lv.children].forEach((c, j) => c.className = j === i ? 'on' : ''); });
    lv.appendChild(b);
  });
  objectPicker(panel.querySelector('#pick'), chosen || OBJECTS.map(o => o.name), names => {
    chosen = names.length === OBJECTS.length ? null : names; store.setJson('mb-words-set', chosen); bag = [];
  });
  const showStats = () => {
    const rows = OBJECTS.filter(o => stats[o.name]).map(o => `${o.word} ${stats[o.name].own} of ${stats[o.name].own + stats[o.name].helped}`);
    panel.querySelector('#stats').textContent = rows.length ? rows.join(' · ') : 'Nothing yet.';
  };
  showStats();
  panel.querySelector('#clearStats').addEventListener('click', () => { for (const k in stats) delete stats[k]; store.setJson('mb-words-stats', stats); showStats(); });
  panel.querySelector('#done').addEventListener('click', closePanel);
}
async function closePanel() {
  panel.hidden = true;
  const id = ++roundId; state = 'busy';
  showWord('');
  await Promise.all(pads.filter(p => p.item && p.item.node.visible).map(p => beamOut(p.item)));
  for (const p of pads) { p.item = null; p.want = 0; }
  next = choosePicks();
  if (id === roundId) newRound();
}
holdToOpen(document.getElementById('gear'), openPanel);

// read-only hook for automated tests
window.__wg = { get state() { return state; }, get target() { return target && target.name; }, get level() { return level; },
  names: () => pads.map(p => p.g.visible && p.item ? p.item.name : null),
  padScreen: i => toScreen(middleOf(pads[i])), glow: () => pads.map(p => +p.glow.toFixed(2)) };

fit();
newRound();
