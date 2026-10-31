/**
 * DiabolosSounds.js — голос и вес Дьяволоса (Diabolos.js), синтез заранее (SoundManager.prewarmStep), не в момент игры:
 *   snore   храп: долгий низкий хрип на вдохе, клокочущий выдох с шипением (дым из ноздрей)
 *   step    копыто встало: глубокий удар, земля гудит, сыплются камни
 *   slam    кулак в землю: удар, треск камня, длинный раскат
 *   chain   звон цепи: тяжёлые железные звенья бьются и скрежещут
 *   roar    рёв: очень низкий, раскатистый, с хрипом и эхом
 *   inhale  вдох перед огнём: нарастающий свист воздуха и гул
 *   fire    струя огня: рёв пламени
 *   ball    шар вылетел: «вжух» и треск
 *   boom    шар взорвался
 *   clap    хлопок ладонями: удар воздуха и вспышка огня
 *   theme   тёмная тема босса: хор низких голосов (минор), орган; drums — барабаны боя (кольцом поверх)
 */
export const DEVIL_SOUNDS = ['snore', 'step', 'slam', 'chain', 'roar', 'inhale', 'fire', 'ball', 'boom', 'clap', 'theme', 'drums',
    // характер (DiabolosActs): бормочет во сне, нюхает, зевает, хрустит, сплёвывает, скребёт рог, вздыхает, хохочет, фыркает, «бе-бе» языком, облизывается, посмеивается, бьёт в грудь
    'mumble', 'sniff', 'yawn', 'crack', 'spit', 'scrape', 'sigh', 'laugh', 'snort', 'blep', 'lick', 'chuckle', 'beat'];
const DUR = { mumble: 2.2, sniff: 1.2, yawn: 3.2, crack: 0.9, spit: 0.8, scrape: 1.6, sigh: 2.4, laugh: 3.4, snort: 0.9, blep: 2.4, lick: 1.4, chuckle: 1.8, beat: 0.6, snore: 3.2, step: 1.4, slam: 2.6, chain: 0.9, roar: 3.6, inhale: 1.7, fire: 4.2, ball: 1.1, boom: 2.4, clap: 1.4, theme: 12, drums: 6 };
const TAU = Math.PI * 2;

/** Простой шум (свой генератор — один и тот же звук на всех компьютерах). */
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; }; }

function thud(d, sr, at, f0, amp, decay, drop = 14) {
    const i0 = Math.floor(at * sr);
    let ph = 0;
    for (let i = 0; i < d.length - i0; i++) {
        const t = i / sr;
        if (t > 2) break;
        ph += TAU * (f0 - drop * Math.min(1, t * 3)) / sr;
        d[i0 + i] += Math.sin(ph) * Math.exp(-t * decay) * amp * Math.min(1, t * 2500);
    }
}
function noise(d, sr, at, dur, amp, lpK, env, R) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const k = i / n;
        lp += (R() - lp) * lpK;
        lp2 += (lp - lp2) * 0.6;
        d[i0 + i] += lp2 * amp * env(k);
    }
}
function growl(d, sr, at, dur, f0, f1, amp, R, rough = 0.35) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0, b1 = 0, p1 = 0, lp = 0;
    const k1 = 2 * Math.sin(Math.PI * 380 / sr);
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, k = t / dur;
        const env = Math.min(1, t * 5) * Math.pow(1 - k, 0.7);
        const f = (f0 + (f1 - f0) * k) * (1 + 0.05 * Math.sin(TAU * 7 * t) + 0.03 * Math.sin(TAU * 23 * t));
        ph += f / sr; ph -= Math.floor(ph);
        lp += (R() - lp) * 0.25;
        const x = (ph * 2 - 1) * 0.7 + lp * rough;
        b1 += k1 * p1; p1 += k1 * (x - b1 - p1 * 0.2) * 0.9;
        d[i0 + i] += env * amp * Math.tanh((x * 0.6 + b1 * 1.2) * 2.2);
    }
}
function clank(d, sr, at, f, amp, R) {
    // металлический удар: несколько негармонических призвуков, быстрый спад
    const i0 = Math.floor(at * sr), parts = [1, 2.76, 5.4, 8.93];
    for (let i = 0; i < Math.floor(0.6 * sr) && i0 + i < d.length; i++) {
        const t = i / sr;
        let s = 0;
        for (let p = 0; p < parts.length; p++) s += Math.sin(TAU * f * parts[p] * t) * Math.exp(-t * (6 + p * 5)) / (p + 1);
        d[i0 + i] += s * amp * Math.min(1, t * 4000);
    }
    noise(d, sr, at, 0.08, amp * 0.6, 0.9, (k) => 1 - k, R);
}
/** Эхо (котловина ада): задержки с затуханием. */
function echo(d, sr, delays, gain) {
    for (const [dt, g] of delays.map((x, i) => [x, gain ** (i + 1)])) {
        const o = Math.floor(dt * sr);
        for (let i = d.length - 1; i >= o; i--) d[i] += d[i - o] * g;
    }
}

export function synthDevil(ctx, kind) {
    // (тема и барабаны — низкие звуки: половина частоты хватает, синтез вдвое быстрее — на загрузке не держит поток долго)
    const sr = kind === 'theme' || kind === 'drums' ? Math.max(8000, Math.round(ctx.sampleRate / 2)) : ctx.sampleRate, len = Math.floor(sr * (DUR[kind] || 1));
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const R = rnd(kind.length * 7919 + kind.charCodeAt(0));
    switch (kind) {
        case 'snore':
            growl(d, sr, 0.1, 1.5, 38, 44, 0.8, R, 0.9); noise(d, sr, 0.1, 1.5, 0.4, 0.06, (k) => Math.sin(k * Math.PI), R);
            growl(d, sr, 1.8, 1.2, 50, 30, 0.5, R, 1.2); noise(d, sr, 1.8, 1.3, 0.5, 0.35, (k) => Math.sin(k * Math.PI) * (1 - k), R); // (выдох с шипением)
            break;
        case 'step':
            thud(d, sr, 0, 26, 1.3, 4.2); noise(d, sr, 0, 0.4, 0.6, 0.3, (k) => Math.exp(-k * 7), R); noise(d, sr, 0.05, 1.3, 0.45, 0.04, (k) => Math.exp(-k * 3), R);
            for (let i = 0; i < 6; i++) clank(d, sr, 0.15 + i * 0.12 + R() * 0.05, 300 + R() * 200, 0.05, R); // (сыплются камни)
            break;
        case 'slam':
            thud(d, sr, 0, 30, 1.4, 3.5, 18); noise(d, sr, 0, 0.12, 1.0, 0.8, (k) => 1 - k, R); noise(d, sr, 0.04, 2.4, 0.6, 0.03, (k) => Math.exp(-k * 2.2) * Math.min(1, k * 20), R);
            for (let i = 0; i < 10; i++) clank(d, sr, 0.1 + R() * 0.8 + 0.8, 200 + R() * 300, 0.04, R);
            echo(d, sr, [0.32, 0.61], 0.35);
            break;
        case 'chain':
            for (let i = 0; i < 5; i++) clank(d, sr, i * 0.11 + Math.abs(R()) * 0.04, 140 + Math.abs(R()) * 120, 0.45, R);
            noise(d, sr, 0, 0.8, 0.25, 0.5, (k) => Math.sin(k * Math.PI) * (1 - k), R); // (скрежет)
            break;
        case 'roar':
            growl(d, sr, 0, 3.2, 72, 34, 1.0, R); growl(d, sr, 0.08, 3.0, 36, 22, 0.8, R, 0.6); growl(d, sr, 0.2, 2.6, 140, 70, 0.25, R, 0.8);
            noise(d, sr, 0.1, 3.2, 0.4, 0.4, (k) => Math.sin(k * Math.PI) * 0.8, R);
            echo(d, sr, [0.42, 0.85], 0.3);
            break;
        case 'inhale':
            noise(d, sr, 0, 1.6, 0.9, 0.12, (k) => k * k * (1 - Math.max(0, k - 0.9) * 10), R); growl(d, sr, 0.3, 1.3, 28, 46, 0.4, R, 0.5);
            break;
        case 'fire':
            noise(d, sr, 0, 4.1, 1.0, 0.08, (k) => Math.min(1, k * 8) * (1 - Math.max(0, k - 0.85) * 6), R); noise(d, sr, 0, 4.1, 0.5, 0.5, (k) => Math.min(1, k * 8) * (0.6 + 0.4 * Math.sin(k * 60)) * (1 - k * 0.5), R);
            growl(d, sr, 0, 4.0, 40, 32, 0.35, R, 1.5);
            break;
        case 'ball':
            noise(d, sr, 0, 1.0, 0.9, 0.2, (k) => Math.sin(k * Math.PI) ** 0.6 * (1 - k * 0.5), R); thud(d, sr, 0, 60, 0.5, 9);
            for (let i = 0; i < 12; i++) noise(d, sr, Math.abs(R()) * 0.9, 0.02, 0.5, 0.9, (k) => 1 - k, R); // (треск)
            break;
        case 'boom':
            thud(d, sr, 0, 40, 1.4, 3, 22); noise(d, sr, 0, 0.3, 1.0, 0.7, (k) => Math.exp(-k * 6), R); noise(d, sr, 0.03, 2.3, 0.7, 0.05, (k) => Math.exp(-k * 2.5), R);
            echo(d, sr, [0.37, 0.7], 0.3);
            break;
        case 'clap':
            noise(d, sr, 0, 0.05, 1.0, 0.95, (k) => 1 - k, R); thud(d, sr, 0, 80, 0.9, 10, 30); noise(d, sr, 0.05, 1.3, 0.6, 0.15, (k) => Math.sin(k * Math.PI) * (1 - k), R);
            echo(d, sr, [0.3], 0.35);
            break;
        case 'theme': {
            // хор низких голосов: ре-минор, медленно меняются аккорды (Dm — B♭ — Gm — A), гласная «а-о» (формант), орган ниже
            const ch = [[146.8, 174.6, 220], [116.5, 146.8, 174.6], [98, 116.5, 146.8], [110, 138.6, 164.8]];
            const seg = DUR.theme / ch.length;
            for (let c = 0; c < ch.length; c++) for (const f of ch[c]) for (let v = 0; v < 2; v++) {
                const det = 1 + (v - 0.5) * 0.006, i0 = Math.floor(c * seg * sr), n = Math.floor(seg * sr);
                let ph = R() * 0.5, lp = 0;
                for (let i = 0; i < n && i0 + i < len; i++) {
                    const t = i / sr, k = i / n;
                    ph += f * det * (1 + 0.004 * Math.sin(TAU * 5 * t + v)) / sr; ph -= Math.floor(ph);
                    const saw = ph * 2 - 1;
                    lp += (saw - lp) * (0.06 + 0.03 * Math.sin(TAU * 0.3 * t)); // (гласная: мягкий фильтр «дышит»)
                    const env = Math.min(1, k * 4) * Math.min(1, (1 - k) * 4);
                    d[i0 + i] += lp * env * 0.07;
                }
            }
            for (let c = 0; c < ch.length; c++) { // орган: корень октавой ниже
                const f = ch[c][0] / 2, i0 = Math.floor(c * seg * sr), n = Math.floor(seg * sr);
                for (let i = 0; i < n && i0 + i < len; i++) { const t = i / sr, k = i / n; d[i0 + i] += (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2 * t) + 0.25 * Math.sin(TAU * f * 3 * t)) * 0.12 * Math.min(1, k * 3) * Math.min(1, (1 - k) * 3); }
            }
            echo(d, sr, [0.45, 0.9], 0.3);
            break;
        }
        case 'drums':
            // тяжёлые барабаны: 1 — 3 — 3+ — 4 (медленно, 80 уд/мин), с громом
            for (let b = 0; b < 8; b++) {
                const at = b * 0.75;
                thud(d, sr, at, 48, b % 4 === 0 ? 1.0 : 0.6, 6, 20);
                if (b % 2) noise(d, sr, at, 0.15, 0.35, 0.5, (k) => Math.exp(-k * 8), R);
                if (b % 4 === 2) thud(d, sr, at + 0.375, 60, 0.4, 8, 20);
            }
            break;
        case 'mumble': // бормотание: низкий голос «слогами», сквозь сон
            for (let i = 0; i < 6; i++) growl(d, sr, 0.1 + i * 0.32, 0.26, 55 + Math.abs(R()) * 25, 45, 0.5 + Math.abs(R()) * 0.4, R, 0.8);
            break;
        case 'sniff': // три коротких втягивания воздуха огромными ноздрями
            for (let i = 0; i < 3; i++) noise(d, sr, i * 0.28, 0.22, 0.9, 0.25, (k) => Math.sin(k * Math.PI) * (0.6 + 0.4 * k), R);
            break;
        case 'yawn': // зевок: голос поднимается и падает, шипение жара
            growl(d, sr, 0, 2.8, 45, 70, 0.8, R, 0.6); growl(d, sr, 1.4, 1.6, 70, 30, 0.6, R, 0.9); noise(d, sr, 0.3, 2.6, 0.35, 0.3, (k) => Math.sin(k * Math.PI), R);
            break;
        case 'crack': // хруст суставов великана: сухие удары
            for (let i = 0; i < 5; i++) { thud(d, sr, i * 0.11 + Math.abs(R()) * 0.03, 120 + Math.abs(R()) * 80, 0.6, 30, 40); noise(d, sr, i * 0.11, 0.03, 0.8, 0.9, (k) => 1 - k, R); }
            break;
        case 'spit': // плевок: «тьфу» и шипение
            noise(d, sr, 0, 0.12, 1.0, 0.7, (k) => 1 - k, R); noise(d, sr, 0.15, 0.6, 0.4, 0.5, (k) => (1 - k) * Math.sin(k * Math.PI * 2 + 1) ** 2, R);
            break;
        case 'scrape': // коготь по рогу: скрип кости
            for (let i = 0; i < 4; i++) { const f0 = 180 + i * 40, at = i * 0.36, n = Math.floor(0.3 * sr), i0 = Math.floor(at * sr); for (let j = 0; j < n && i0 + j < len; j++) { const t = j / sr; d[i0 + j] += Math.sin(TAU * (f0 + 60 * Math.sin(t * 40)) * t) * Math.sin(Math.PI * j / n) * 0.3 * (0.6 + 0.4 * R()); } }
            break;
        case 'sigh': // тяжёлый вздох с дымом
            noise(d, sr, 0, 2.3, 0.9, 0.08, (k) => Math.sin(k * Math.PI) ** 0.7 * (1 - k * 0.4), R); growl(d, sr, 0.4, 1.6, 40, 28, 0.35, R, 1.2);
            break;
        case 'laugh': // хохот: «ХО — ХО — ХО» низким басом, с раскатом
            for (let i = 0; i < 7; i++) { const at = 0.1 + i * 0.42 + R() * 0.03; growl(d, sr, at, 0.32, 78 - i * 3, 52 - i * 2, 0.9 - i * 0.06, R, 0.4); noise(d, sr, at, 0.1, 0.4, 0.4, (k) => 1 - k, R); }
            echo(d, sr, [0.38, 0.77], 0.3);
            break;
        case 'snort': // фырканье
            noise(d, sr, 0, 0.35, 1.0, 0.2, (k) => Math.exp(-k * 5), R); growl(d, sr, 0, 0.3, 60, 40, 0.4, R, 1);
            break;
        case 'blep': // «бе-бе-бе» языком: вибрация губ и мокрые шлепки
            for (let i = 0; i < 10; i++) { growl(d, sr, 0.1 + i * 0.2, 0.16, 90 + (i % 2) * 20, 85, 0.5, R, 1.2); noise(d, sr, 0.1 + i * 0.2, 0.04, 0.5, 0.8, (k) => 1 - k, R); }
            break;
        case 'lick': // облизывается: влажное «шлёп» и протяжный мокрый звук
            noise(d, sr, 0, 1.2, 0.6, 0.45, (k) => Math.sin(k * Math.PI) * (0.6 + 0.4 * Math.sin(k * 40) ** 2), R); thud(d, sr, 1.0, 140, 0.3, 25);
            break;
        case 'chuckle': // смешок: «хм-хм-хм» сквозь зубы
            for (let i = 0; i < 4; i++) growl(d, sr, 0.1 + i * 0.3, 0.2, 62, 55, 0.6, R, 0.5);
            break;
        case 'beat': // кулак в грудь: глухой барабан
            thud(d, sr, 0, 40, 1.2, 10, 10); noise(d, sr, 0, 0.08, 0.5, 0.3, (k) => 1 - k, R);
            break;
        default: break;
    }
    let peak = 0.01;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    const g = 0.9 / peak;
    for (let i = 0; i < len; i++) d[i] *= g;
    return buf;
}
