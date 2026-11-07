/**
 * SystemSpecsUi.js — «💻 Требования к ПК» в «Механике игры» (автор 07.11): что нужно игре, подходит ли этот компьютер, и кнопка
 * «Подобрать индивидуальные настройки» (AutoTune.js: замер на видеокарте, затем «Графика» и «Прорисовка мира» выставляются сами; «Вернуть прежние» — назад).
 * Правила и цифры — game/SystemSpecs.js.
 */
import { SPEC_TIERS, SPEC_COMMON, PRESETS, verdict, isSoftwareGpu } from '../game/SystemSpecs.js';
import { runTune, lastTune, rememberTune } from './AutoTune.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIER_TEXT = { none: 'ниже минимальных', min: 'минимальным', rec: 'рекомендуемым', max: 'максимальным', unknown: 'не удалось определить по названию' };

/** Что известно о компьютере (браузер не говорит больше 8 ГБ памяти и округляет — это нормально). */
export function readHardware() {
    const gpu = (typeof window !== 'undefined' && window.__zns?.gpu) || {};
    return {
        gpuName: gpu.name || '', gpuShort: gpu.short || '', weakGpu: !!gpu.weak,
        threads: navigator.hardwareConcurrency || 0,
        ramGb: navigator.deviceMemory || 0,
        screen: `${Math.round(screen.width * (devicePixelRatio || 1))}×${Math.round(screen.height * (devicePixelRatio || 1))}`,
    };
}

/**
 * Нарисовать вкладку в `box`. env: { get(): {graphics, view}, set({graphics, view}), busy(): bool } — чтение и запись настроек «Графика» / «Прорисовка мира».
 */
export function renderSpecsTab(box, env) {
    if (!box) return;
    const hw = readHardware();
    const v = verdict(hw);
    const tuned = lastTune();
    let running = null; // AbortController
    const tierCard = (t) => `<div class="spec-card${v.tier === t.id ? ' you' : ''}">
        <h4>${t.mark} ${esc(t.name)}${v.tier === t.id ? ' <span class="spec-you">← ваш компьютер</span>' : ''}</h4>
        <p class="spec-play">${esc(t.play)}</p>
        <dl><dt>Видеокарта</dt><dd>${esc(t.gpu)}; видеопамяти от ${t.vram} ГБ</dd><dt>Процессор</dt><dd>${esc(t.cpu)}</dd><dt>Память</dt><dd>${t.ram} ГБ</dd></dl></div>`;
    box.innerHTML = `
        <div class="spec-me">
            <h3>🖥️ Ваш компьютер</h3>
            <dl>
                <dt>Видеокарта</dt><dd>${esc(hw.gpuShort || hw.gpuName || 'не определена')}${v.gpu.known ? ` <span class="mp-hint">(${esc(v.gpu.label)}, около ${v.gpu.score} по PassMark)</span>` : ''}</dd>
                <dt>Процессор</dt><dd>${hw.threads ? hw.threads + ' потоков' : 'не определён'}</dd>
                <dt>Память</dt><dd>${hw.ramGb ? 'не меньше ' + hw.ramGb + ' ГБ <span class="mp-hint">(браузер показывает не больше 8)</span>' : 'браузер не сообщает'}</dd>
                <dt>Экран</dt><dd>${esc(hw.screen)}</dd>
            </dl>
            <p class="spec-verdict spec-${v.tier}">${v.tier === 'unknown' ? '❔ Эту видеокарту игра по названию не знает.' : v.tier === 'none' ? '⚠️ По названию — слабее минимальных требований.' : `✅ По названию подходит под <b>${TIER_TEXT[v.tier]}</b> требования (видеокарта: ${TIER_TEXT[v.byGpu]}, процессор: ${TIER_TEXT[v.byCpu]}).`}</p>
            ${v.note.map((n) => `<p class="spec-note">${esc(n)}</p>`).join('')}
            <p class="mp-hint">Название — только ориентир. Точнее скажет замер: нажмите кнопку — игра сама измерит видеокарту и выставит графику и дальность мира так, чтобы кадров хватало с запасом.</p>
            <div class="spec-tune">
                <button type="button" class="menu-btn" id="spec-tune-btn">⚙️ Подобрать индивидуальные настройки</button>
                <button type="button" class="menu-btn" id="spec-undo-btn" hidden style="background:#7f8c8d">↩ Вернуть прежние</button>
                <div class="spec-bar" id="spec-bar" hidden><i id="spec-bar-fill"></i></div>
                <p id="spec-tune-out" class="spec-note">${tuned ? tuneLine(tuned) : ''}</p>
            </div>
        </div>
        <h3>📋 Требования</h3>
        <div class="spec-grid">${tierCard(SPEC_TIERS.min)}${tierCard(SPEC_TIERS.rec)}${tierCard(SPEC_TIERS.max)}</div>
        <h3>Для всех ступеней</h3>
        <dl class="spec-common">${SPEC_COMMON.map(([k, t]) => `<dt>${esc(k)}</dt><dd>${esc(t)}</dd>`).join('')}</dl>
        <p class="mp-hint">Видеокарты сравнены по «G3D Mark» (<a href="https://www.videocardbenchmark.net" target="_blank" rel="noopener">videocardbenchmark.net</a>), процессоры — по «CPU Mark» (<a href="https://www.cpubenchmark.net" target="_blank" rel="noopener">cpubenchmark.net</a>); цифры — около, они меняются. Ступени ориентировочные: игра в основном нагружает видеокарту пикселями (разрешение, тени, облака) и дальностью мира.</p>`;
    const $ = (id) => box.querySelector('#' + id);
    const btn = $('spec-tune-btn'), undo = $('spec-undo-btn'), bar = $('spec-bar'), fill = $('spec-bar-fill'), out = $('spec-tune-out');
    let before = null;
    btn.onclick = async () => {
        if (running) { running.abort(); return; }
        if (env.busy?.()) { out.textContent = 'Подбор — только в меню, пока игра не идёт.'; return; }
        running = new AbortController();
        btn.textContent = '✖ Отменить подбор'; bar.hidden = false; fill.style.width = '2%'; out.textContent = 'Замер… не закрывайте вкладку.';
        const res = await runTune({ hw, signal: running.signal, onProgress: (t, share) => { out.textContent = t; fill.style.width = Math.round(share * 100) + '%'; } });
        const cancelled = running.signal.aborted;
        running = null; btn.textContent = '⚙️ Подобрать индивидуальные настройки'; bar.hidden = true;
        if (cancelled) { out.textContent = 'Подбор отменён, настройки не менялись.'; return; }
        if (!res.ok) { out.textContent = res.why || 'Не получилось.'; return; }
        before = env.get();
        env.set({ graphics: res.pick.preset.graphics, view: res.pick.preset.view });
        const rec = { at: Date.now(), gpu: hw.gpuShort, id: res.pick.preset.id, name: res.pick.preset.name, ms: res.pick.ms, headroom: res.pick.headroom, reason: res.pick.reason, soft: res.why === 'software' };
        rememberTune(rec);
        out.textContent = tuneLine(rec);
        undo.hidden = false;
    };
    undo.onclick = () => { if (before) { env.set(before); out.textContent = 'Прежние настройки возвращены.'; undo.hidden = true; } };
}

function tuneLine(t) {
    if (t.soft) return '⚠️ Видеокарты нет (программная отрисовка): выставлены самые лёгкие настройки.';
    const ms = Number.isFinite(t.ms) ? `, кадр сцены-образца ${t.ms.toFixed(1)} мс` : '';
    const why = t.reason === 'cpu' ? ' Дальше ограничил процессор: ему нужно успевать строить мир.' : t.reason === 'weak' ? ' Даже самая лёгкая тяжеловата — может проседать.' : '';
    return `✅ Выставлено: ${t.name}${ms}${t.headroom ? ` — запас по скорости около ${t.headroom}%` : ''}.${why} Это самое красивое, что идёт без просадок.`;
}
