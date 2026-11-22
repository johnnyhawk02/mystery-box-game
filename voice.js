// Spoken words: recorded Azure "Sonia" clips (made by tools/make_voice.py) when there is one for the text,
// otherwise the device's own voice. One audio element is reused so iPad Safari, once unlocked by her
// first touch, lets later words play by themselves.
const V = new URL(import.meta.url).searchParams.get('v') || '';
const DIR = 'assets/voice/sonia/';
export const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let clips = new Set();
const ready = fetch(DIR + 'index.json' + (V ? '?v=' + V : '')).then(r => r.ok ? r.json() : []).then(a => { clips = new Set(a); }).catch(() => {});
const audio = new Audio();
audio.preload = 'auto';
let unlocked = false;
// the first touch anywhere plays a silent moment, which lets the page play sound from then on
document.addEventListener('pointerdown', () => {
  if (unlocked) return; unlocked = true;
  if (!audio.src && clips.size) audio.src = DIR + [...clips][0] + '.mp3' + (V ? '?v=' + V : '');
  audio.muted = true;
  const p = audio.play(); if (p) p.then(() => { audio.pause(); audio.muted = false; }).catch(() => { audio.muted = false; });
}, { capture: true });

function deviceVoice(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = 0.8; u.pitch = 1.05; u.lang = 'en-GB';
  speechSynthesis.speak(u);
}
export async function speak(text) {
  await ready;
  const s = slug(text);
  window.speechSynthesis?.cancel();
  if (!clips.has(s)) return deviceVoice(text);
  audio.pause();
  audio.muted = false;
  audio.src = DIR + s + '.mp3' + (V ? '?v=' + V : '');
  audio.currentTime = 0;
  audio.play().catch(() => deviceVoice(text));
}
export function hush() { audio.pause(); window.speechSynthesis?.cancel(); }
