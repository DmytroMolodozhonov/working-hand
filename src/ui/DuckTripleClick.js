// Пасхалка: три быстрых нажатия на «🎮 Одиночная игра» → кряканье.
// Звук синтезируется через Web Audio, отдельный файл не нужен.

const TAB_SELECTOR = '[data-tab="tab-game"]';
const WINDOW_MS = 800;   // окно, в которое должны уложиться три нажатия
const NEEDED = 3;

let clicks = [];
let ctx = null;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Один «кряк»: пила с падающей частотой, пропущенная через фильтр, и короткая огибающая
function quackAt(ac, t0) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(760, t0);
  osc.frequency.exponentialRampToValueAtTime(330, t0 + 0.16);
  filter.type = 'bandpass';
  filter.frequency.value = 1100;
  filter.Q.value = 1.4;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.22);
}

function playQuack() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime + 0.02;
  quackAt(ac, now);
  quackAt(ac, now + 0.24);
}

document.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest ? e.target.closest(TAB_SELECTOR) : null;
  if (!btn) { clicks = []; return; }
  const now = Date.now();
  clicks = clicks.filter((t) => now - t < WINDOW_MS);
  clicks.push(now);
  if (clicks.length >= NEEDED) {
    clicks = [];
    try { playQuack(); } catch (err) { console.warn('[duck] звук не воспроизведён', err); }
  }
}, true);
