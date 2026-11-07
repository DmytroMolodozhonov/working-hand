/**
 * SystemSpecs.js — «Требования к ПК» (автор 07.11): насколько игра подходит компьютеру, и какие настройки подойдут именно ему.
 * Чистые правила, без DOM и THREE (проверяет tests/unit/system-specs.test.js). Окно — `src/ui/SystemSpecsUi.js`, замер — `src/ui/AutoTune.js`.
 *
 * ОТКУДА ЦИФРЫ (честно): видеокарты — «G3D Mark» с videocardbenchmark.net (PassMark; среднее по присланным замерам, 2025–2026, поэтому «около»); процессоры —
 * «CPU Mark» с cpubenchmark.net. Пороги «минимум / рекомендуется / максимум» выбраны по устройству игры (см. Quality.js: цена в основном за пиксель — разрешение,
 * тени, мягкие тени; прорисовка мира ×1…×3 по площади; «Ультра» — густой газон и тень 3072) и НЕ измерены на каждой видеокарте (в контейнере разработки
 * видеокарты нет). Поэтому окно говорит «ориентировочно», а настоящий ответ для этого компьютера даёт кнопка «Подобрать индивидуальные настройки»
 * (AutoTune.js — замер на самой видеокарте игрока).
 */

/** Якоря видеокарт: [шаблон имени, G3D Mark, как назвать]. Только то, что найдено в PassMark; чужие модели игра по названию не оценивает (скажет честно). */
export const GPU_ANCHORS = [
    [/RTX\s*4090(?!\s*Laptop)/i, 38000, 'GeForce RTX 4090'],
    [/RTX\s*4070(?!\s*(Ti|Super|Laptop))/i, 26970, 'GeForce RTX 4070'],
    [/RTX\s*4060\s*Ti/i, 22740, 'GeForce RTX 4060 Ti'],
    [/RTX\s*4060(?!\s*(Ti|Laptop))/i, 19500, 'GeForce RTX 4060'],
    [/RTX\s*3060(?!\s*(Ti|Laptop))/i, 16860, 'GeForce RTX 3060'],
    [/RTX\s*2060(?!\s*(Super|Laptop))/i, 14120, 'GeForce RTX 2060'],
    [/RTX\s*3050(?!\s*(Ti|Laptop))/i, 11650, 'GeForce RTX 3050 (6–8 ГБ)'],
    [/GTX\s*1060/i, 10080, 'GeForce GTX 1060'],
    [/GTX\s*1650(?!\s*Ti)/i, 7870, 'GeForce GTX 1650'],
    [/GTX\s*1050\s*Ti/i, 6300, 'GeForce GTX 1050 Ti'],
    [/GTX\s*1050(?!\s*Ti)/i, 5030, 'GeForce GTX 1050'],
    [/Radeon\s*RX\s*6600(?!\s*(M|XT))/i, 15160, 'Radeon RX 6600'],
    [/Radeon\s*780M/i, 6900, 'Radeon 780M (встроенная)'],
    [/Arc\s*A750/i, 12340, 'Intel Arc A750'],
    [/Iris\(R\)\s*Xe|Iris\s*Xe/i, 2670, 'Intel Iris Xe (встроенная)'],
    [/Apple\s*M1(?!\s*(Pro|Max|Ultra))/i, 5000, 'Apple M1'],
    [/UHD\s*Graphics/i, 1520, 'Intel UHD Graphics (встроенная)'],
];

/** Три ступени. g3d — порог видеокарты (около), threads — потоков процессора, ram — ГБ оперативной памяти. */
export const SPEC_TIERS = Object.freeze({
    min: {
        id: 'min', name: 'Минимальные', mark: '🟡',
        play: 'Играть можно на низкой графике и низкой прорисовке мира; кадров хватает не везде — «Авто» сама снижает картинку.',
        g3d: 2500, threads: 4, ram: 8, vram: 2,
        gpu: 'как у Intel Iris Xe, GeForce GTX 1050 (встроенная графика Intel UHD слабее — игра на ней будет рывками)',
        cpu: '4 потока: Intel Core i3-8100 или лучше',
    },
    rec: {
        id: 'rec', name: 'Рекомендуемые', mark: '🟢',
        play: 'Высокая графика, средняя или высокая прорисовка, плавные 60 кадров.',
        g3d: 7500, threads: 8, ram: 16, vram: 4,
        gpu: 'как у GeForce GTX 1650, GTX 1060 (около 8 000–10 000 по PassMark) и выше; Radeon 780M — граница',
        cpu: 'от 8 потоков: AMD Ryzen 5 3600 (6 ядер, 12 потоков) или лучше',
    },
    max: {
        id: 'max', name: 'Максимальные («Ультра» + самая дальняя прорисовка)', mark: '🔵',
        play: 'Ультра-картинка с густым газоном, мягкими тенями и максимальной дальностью мира.',
        g3d: 19000, threads: 12, ram: 16, vram: 8,
        gpu: 'как у GeForce RTX 4060 (около 19 500) и выше: RTX 4060 Ti, RTX 4070, RTX 4090',
        cpu: 'от 12 потоков: например Ryzen 7 / Core i7 и новее',
    },
});

/** Что нужно ВСЕМ ступеням (не зависит от видеокарты). */
export const SPEC_COMMON = Object.freeze([
    ['Система и браузер', 'Windows 10/11 (64 бита) или Mac; свежий Google Chrome или Microsoft Edge. Python игра ставит сама.'],
    ['Камера', 'Любая веб-камера, 720p при 30 кадрах: игра управляется телом и руками. Руки и тело считает нейросеть на видеокарте; без неё — на процессоре (тогда игре остаётся меньше сил).'],
    ['Микрофон', 'Любой: заклинания говорят вслух. Нейросеть распознавания голоса — на видеокарте, если она подошла, иначе на процессоре.'],
    ['Место на диске', 'около 0,3 ГБ сама игра, ~0,15–0,25 ГБ голосовые нейросети, ещё 0,7 ГБ (простая) / 2,6 ГБ (умная) / 4,5 ГБ (самая умная) — нейросеть жителей.'],
    ['Умные жители', 'Gemma 4 E2B (2,6 ГБ) нужна видеокарта с 4+ ГБ видеопамяти; E4B (4,5 ГБ) — видеокарта от 8 ГБ; без видеокарты игра берёт самую маленькую нейросеть или готовые фразы.'],
    ['Интернет', 'Только для мультиплеера и одной загрузки нейросети жителей.'],
]);

/** Оценка видеокарты по названию: { score, label, known }. score — G3D Mark (около) или null, если модель игра по названию не знает. */
export function gpuScore(name) {
    const n = String(name || '');
    for (const [re, g3d, label] of GPU_ANCHORS) if (re.test(n)) return { score: g3d, label, known: true };
    return { score: null, label: '', known: false };
}

/** Похоже на программную отрисовку (без видеокарты). */
export const isSoftwareGpu = (name) => /SwiftShader|llvmpipe|Software|Microsoft Basic|softpipe/i.test(String(name || ''));

/**
 * Подходит ли компьютер. hw: { gpuName, threads, ramGb (может быть неизвестна), weakGpu }.
 * → { tier: 'none' | 'min' | 'rec' | 'max' | 'unknown', gpu: {score,label,known}, parts: [{what, have, need, ok}], note }
 * Ступень — наименьшая из ступеней по видеокарте и по процессору; память — только предупреждением (браузер сообщает не больше 8 ГБ).
 */
export function verdict(hw) {
    const gpu = gpuScore(hw.gpuName);
    const soft = isSoftwareGpu(hw.gpuName);
    const order = ['none', 'min', 'rec', 'max'];
    const byGpu = soft ? 'none' : !gpu.known ? 'unknown' : gpu.score >= SPEC_TIERS.max.g3d ? 'max' : gpu.score >= SPEC_TIERS.rec.g3d ? 'rec' : gpu.score >= SPEC_TIERS.min.g3d ? 'min' : 'none';
    const th = Number(hw.threads) || 0;
    const byCpu = th >= SPEC_TIERS.max.threads ? 'max' : th >= SPEC_TIERS.rec.threads ? 'rec' : th >= SPEC_TIERS.min.threads ? 'min' : 'none';
    let tier = byGpu === 'unknown' ? 'unknown' : order[Math.min(order.indexOf(byGpu), order.indexOf(byCpu))];
    const parts = [
        { what: 'Видеокарта', have: soft ? 'нет видеокарты (программная отрисовка)' : (gpu.known ? `${gpu.label}, около ${gpu.score}` : (hw.gpuName || 'не определена')), ok: byGpu },
        { what: 'Процессор', have: th ? `${th} потоков` : 'не определён', ok: byCpu },
    ];
    const ram = Number(hw.ramGb) || 0;
    const note = [];
    if (soft) note.push('Игра рисует без видеокарты — будет очень медленно. Проверьте, что Chrome использует видеокарту (аппаратное ускорение).');
    else if (hw.weakGpu && byGpu !== 'unknown' && byGpu !== 'none') note.push('Chrome выбрал встроенную графику: если в компьютере есть мощная видеокарта, включите её для Chrome.');
    if (byGpu === 'unknown') note.push('Эту видеокарту игра по названию не знает — нажмите «Подобрать индивидуальные настройки»: игра измерит её сама.');
    if (ram && ram < 8) note.push('Оперативной памяти меньше 8 ГБ — закройте лишние программы.');
    return { tier, gpu, parts, note, byGpu, byCpu };
}

// ------------------------------------------------------------------ подбор настроек

/**
 * Наборы настроек от самого красивого к самому лёгкому: «Графика» (graphics-quality), «Прорисовка мира» (view-distance).
 * `gl` — номер уровня Quality.QUALITY_LEVELS (ultra — ULTRA_LEVEL), `view` — масштаб прорисовки (Quality.VIEW_DISTANCES).
 */
export const PRESETS = Object.freeze([
    { id: 'ultra-max', graphics: 'ultra', view: 'max', name: 'Ультра, прорисовка максимальная' },
    { id: 'ultra-high', graphics: 'ultra', view: 'high', name: 'Ультра, прорисовка высокая' },
    { id: 'ultra-medium', graphics: 'ultra', view: 'medium', name: 'Ультра, прорисовка средняя' },
    { id: 'high-max', graphics: '3', view: 'max', name: 'Высокая, прорисовка максимальная' },
    { id: 'high-high', graphics: '3', view: 'high', name: 'Высокая, прорисовка высокая' },
    { id: 'high-medium', graphics: '3', view: 'medium', name: 'Высокая, прорисовка средняя' },
    { id: 'mid-medium', graphics: '2', view: 'medium', name: 'Средняя, прорисовка средняя' },
    { id: 'mid-low', graphics: '2', view: 'low', name: 'Средняя, прорисовка низкая' },
    { id: 'low-low', graphics: '1', view: 'low', name: 'Низкая, прорисовка низкая' },
    { id: 'verylow-low', graphics: '0', view: 'low', name: 'Очень низкая, прорисовка низкая' },
]);

/**
 * Запас: игра кроме замеренной сцены рисует небо, существ, руки героя, интерфейс и считает свою логику — поэтому замер должен укладываться
 * не в весь кадр (60 кадров = 16,7 мс), а в долю его. 4 мс на видеокарте — запас в четыре раза (замер без неба с существами, рук героя и логики; пока он не сверен с настоящей игрой на разных видеокартах, берём осторожно): просадок быть не должно.
 */
export const TUNE = Object.freeze({ BUDGET_MS: 4, WEAK_CPU_THREADS: 4, LOW_RAM_GB: 4 });

/** Потолок по процессору и памяти (мир считают воркеры, ядрам нужно успеть): индекс в PRESETS, ниже которого нельзя подниматься. */
export function presetFloor(hw) {
    let first = 0; // самый красивый разрешён
    const th = Number(hw.threads) || 8;
    if (th < SPEC_TIERS.min.threads) first = Math.max(first, PRESETS.findIndex((p) => p.id === 'mid-low'));
    else if (th < SPEC_TIERS.rec.threads) first = Math.max(first, PRESETS.findIndex((p) => p.id === 'high-medium'));
    else if (th < SPEC_TIERS.max.threads) first = Math.max(first, PRESETS.findIndex((p) => p.id === 'ultra-medium'));
    const ram = Number(hw.ramGb) || 8;
    if (ram < TUNE.LOW_RAM_GB) first = Math.max(first, PRESETS.findIndex((p) => p.id === 'low-low'));
    if (hw.weakGpu) first = Math.max(first, PRESETS.findIndex((p) => p.id === 'mid-low'));
    return first;
}

/**
 * Выбор по замерам: `ms` — { id набора → мс на кадр (медиана) }, набор без замера пропускается. Берётся самый красивый набор не выше потолка по процессору,
 * который укладывается в бюджет; нет ни одного — самый лёгкий. → { preset, ms, headroom, reason }
 */
export function pickPreset(ms, hw = {}, budget = TUNE.BUDGET_MS) {
    const first = presetFloor(hw);
    for (let i = first; i < PRESETS.length; i++) {
        const p = PRESETS[i], t = ms[p.id];
        if (!Number.isFinite(t)) continue;
        if (t <= budget) return { preset: p, ms: t, headroom: Math.round((1 - t / (1000 / 60)) * 100), reason: i === first && first > 0 ? 'cpu' : 'gpu' };
    }
    const last = PRESETS[PRESETS.length - 1];
    return { preset: last, ms: ms[last.id] ?? null, headroom: 0, reason: 'weak' };
}
