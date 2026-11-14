/**
 * DeviceNames.js — «Нейросеть считает на: …» names the real hardware (the author 14.11: «писалось конкретную видеокарту или процессор, который есть у игрока;
 * по умолчанию видеокарта, а не процессор»). The browser knows only the card that draws the page, so the program (`/api/system`, hw_info.py) adds the processor
 * and every card; this module turns what is known into the words of the three choices and puts them into the <select>.
 *   Авто — видеокарта: NVIDIA GeForce RTX 3050 (есть также: Intel UHD Graphics)      ← the card first; no real card → the processor
 *   Видеокарте — NVIDIA GeForce RTX 3050 (есть также: Intel UHD Graphics)
 *   Процессоре — AMD Ryzen 5 5600 (если игра подтормаживает)
 * «А если»: no real card (a software renderer: the page is drawn by the processor) — the choice says so and «Авто» says «процессор»; the program is not answering
 * (the browser's own card only; the processor as «N потоков»); a card name too long (cut); the same card twice (once); the saved choice is never changed.
 */
import { isSoftwareGpu } from '../game/SystemSpecs.js';

const MAX = 60;
/** A card's name as a person writes it: the page's own string and the program's differ — «Intel(R) UHD Graphics 770 (CFL GT2)», «Mesa Intel UHD Graphics», «ANGLE (… Direct3D11 vs_5_0)». */
export function plainName(s) {
    return String(s || '')
        .replace(/\((?:R|TM|r|tm)\)/g, '')
        .replace(/^ANGLE \((?:[^,]*,\s*)?/, '').replace(/\s*\(0x[0-9a-f]+\).*$/i, '').replace(/\s*(?:Direct3D|OpenGL|Vulkan|Metal)\b.*$/i, '')
        .replace(/^Mesa\s+/i, '').replace(/\s*\([A-Z0-9 ,.-]{2,16}\)\s*$/, '') // («(CFL GT2)», «(RADV NAVI23)»: the chip's code name)
        .replace(/\)$/, '').replace(/\s+/g, ' ').trim();
}
/** The same card? (one name holds the other, or they share the model's numbers and the maker) */
export function sameCard(a, b) {
    const x = plainName(a).toLowerCase(), y = plainName(b).toLowerCase();
    if (!x || !y) return false;
    if (x.includes(y) || y.includes(x)) return true;
    const num = (s) => (s.match(/\d{3,5}[a-z]{0,2}/g) || []).join(','), maker = (s) => (s.match(/nvidia|amd|radeon|geforce|intel|apple|arc/) || [''])[0];
    return !!num(x) && num(x) === num(y) && maker(x) === maker(y);
}
const cut = (s) => (s.length > MAX ? s.slice(0, MAX - 1) + '…' : s);

/** The words of the three choices. info = { gpuShort, gpuName, cpu, gpus[], threads }. → { auto, GPU, CPU, hasGpu } */
export function deviceLabels(info = {}) {
    const soft = isSoftwareGpu(info.gpuName || info.gpuShort);
    const page = plainName(info.gpuShort || info.gpuName || '');
    const all = [];
    if (page && !soft) all.push(page);
    for (const g of info.gpus || []) {
        const n = plainName(g);
        if (!n || isSoftwareGpu(n)) continue;
        // (the same card as the page's own, written another way: «NVIDIA GeForce RTX 3050» vs «… Laptop GPU», «Intel(R) UHD Graphics 770 (…)» vs «Intel UHD Graphics 770» — one)
        if (all.some((a) => sameCard(a, n))) continue;
        all.push(n);
    }
    const hasGpu = all.length > 0;
    const gpuText = hasGpu ? cut(all[0]) + (all.length > 1 ? ` (есть также: ${cut(all.slice(1).join(', '))})` : '') : '';
    const cpu = String(info.cpu || '').trim();
    const cpuText = cpu ? cut(cpu) : info.threads ? `процессор, ${info.threads} потоков` : 'процессор';
    return {
        hasGpu,
        auto: hasGpu ? `Авто — видеокарта: ${gpuText}` : `Авто — процессор: ${cpuText} (видеокарты не найдено)`,
        GPU: hasGpu ? `Видеокарте — ${gpuText}` : 'Видеокарте — не найдена (игру рисует процессор)',
        CPU: `Процессоре — ${cpuText} (если игра подтормаживает)`,
    };
}

/** Writes the labels into the <select> (the values and the saved choice stay as they are). */
export function applyDeviceLabels(select, info) {
    if (!select) return null;
    const L = deviceLabels(info);
    for (const opt of select.options) if (L[opt.value]) opt.textContent = L[opt.value];
    return L;
}

/** At once with what the page knows; again when the program answers with the processor and the other cards. */
export async function fillDeviceNames(select, gpu = {}, fetcher = (typeof fetch === 'function' ? fetch : null)) {
    const base = { gpuShort: gpu.short, gpuName: gpu.name, threads: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0 };
    applyDeviceLabels(select, base);
    if (!fetcher) return;
    try {
        const r = await fetcher('/api/system');
        if (!r.ok) return;
        const j = await r.json();
        applyDeviceLabels(select, { ...base, cpu: j.cpu, gpus: Array.isArray(j.gpus) ? j.gpus : [] });
    } catch (e) { /* the program does not answer: the page's own words stay */ }
}
