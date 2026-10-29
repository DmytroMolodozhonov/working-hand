/**
 * VoiceChatUi.js — the voice chat's settings: «Создать сервер» (the mode, chosen by the host) and Escape → «🔊 Звук» →
 * «🎙 Голосовой чат» (the mode on the go, the friends' loudness, the microphone and the output, «нажми и говори», the
 * browser's echo / noise / gain cleaning, who is heard now). The texts tell the player what each thing gives him and how
 * to use it (CLAUDE.md: «Описания для игрока»).
 */

import { MODES, MODE_TITLE, MODE_HINT, loadSettings, saveSettings, RADIUS } from '../net/VoiceChatRules.js';
import { keyLabel } from '../net/VoiceChat.js';

const ME_TITLE = {
    auto: 'Как на сервере',
    own: 'Я говорю через Discord / свою программу',
    off: 'Выключить для меня',
};

const el = (doc, tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const noKeys = (ctl) => ctl.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });

/**
 * @param {object} o  { pane (the Escape «Звук» tab), create (the «Создать сервер» box), doc }
 * @returns {{attach(vc), sync(), createMode(): string}}
 */
export function setupVoiceChatUi({ pane, create, doc = document } = {}) {
    let vc = null;
    // ------------------------------------------------------------ «Создать сервер»: the mode for everybody
    let createSel = null;
    if (create) {
        const row = el(doc, 'div', 'mp-row mp-voice-row');
        const lab = el(doc, 'label', null, '🎙 Голосовой чат:');
        lab.htmlFor = 'mp-voice';
        createSel = el(doc, 'select');
        createSel.id = 'mp-voice';
        for (const m of MODES) createSel.appendChild(new Option(MODE_TITLE[m], m));
        createSel.value = loadSettings().mode; // (off the first time — the author; then the last choice)
        const hint = el(doc, 'div', 'mp-hint mp-voice-hint');
        const show = () => { hint.textContent = MODE_HINT[createSel.value] || ''; };
        createSel.addEventListener('change', () => { saveSettings({ ...loadSettings(), mode: createSel.value }); show(); });
        show();
        row.append(lab, createSel);
        const host = create.querySelector('#hero-settings-mp') || null;
        create.insertBefore(row, host);
        create.insertBefore(hint, host);
    }

    // ------------------------------------------------------------ Escape → «Звук» → «Голосовой чат»
    const box = pane ? el(doc, 'div', 'vc-pane') : null;
    const ctl = {};
    if (box) {
        box.appendChild(el(doc, 'div', 'vc-title', '🎙 Голосовой чат'));
        const row = (title, c, hintText = null) => {
            const r = el(doc, 'div', 'pause-audio-row');
            const l = el(doc, 'label', 'pause-audio-label', title);
            const line = el(doc, 'div', 'pause-audio-ctl');
            line.appendChild(c);
            r.append(l, line);
            let h = null;
            if (hintText !== null) { h = el(doc, 'div', 'pause-audio-hint', hintText); r.appendChild(h); }
            box.appendChild(r);
            noKeys(c);
            return { r, h, line };
        };
        const select = (opts) => { const s = el(doc, 'select'); for (const [v, t] of opts) s.appendChild(new Option(t, v)); return s; };
        ctl.server = select(MODES.map((m) => [m, MODE_TITLE[m]]));
        ctl.serverRow = row('На этом сервере', ctl.server, '');
        ctl.me = select(Object.entries(ME_TITLE));
        ctl.meRow = row('Для меня', ctl.me, 'Если вы с друзьями уже говорите в Discord, выберите «через Discord»: игра не будет передавать голос второй раз, но будет знать, что голос друга из ваших колонок — не ваш.');
        ctl.vol = el(doc, 'input'); ctl.vol.type = 'range'; ctl.vol.min = '0'; ctl.vol.max = '200'; ctl.vol.step = '5';
        ctl.volVal = el(doc, 'span', 'pause-audio-val');
        ctl.volRow = row('Громкость друзей', ctl.vol);
        ctl.volRow.line.appendChild(ctl.volVal);
        ctl.mic = select([['', 'Как в системе']]);
        ctl.micRow = row('Микрофон для чата', ctl.mic);
        ctl.out = select([['', 'Как в системе']]);
        ctl.outRow = row('Куда выводить голоса', ctl.out);
        const check = (title) => { const lab = el(doc, 'label', 'pause-check'); const c = el(doc, 'input'); c.type = 'checkbox'; lab.append(c, title); return { lab, c }; };
        ctl.ptt = check('Нажми и говори');
        ctl.pttRow = row('Передача голоса', ctl.ptt.lab, '');
        noKeys(ctl.ptt.c);
        ctl.sens = el(doc, 'input'); ctl.sens.type = 'range'; ctl.sens.min = '0'; ctl.sens.max = '100'; ctl.sens.step = '5';
        ctl.sensRow = row('Чувствительность', ctl.sens, 'Выше — передаётся и тихая речь; ниже — только громкая (если друзья слышат ваш шум, сделайте ниже).');
        const clean = el(doc, 'div', 'vc-checks');
        ctl.aec = check('Эхоподавление'); ctl.ns = check('Шумоподавление'); ctl.agc = check('Автоусиление');
        for (const c of [ctl.aec, ctl.ns, ctl.agc]) { clean.appendChild(c.lab); noKeys(c.c); }
        ctl.cleanRow = row('Очистка микрофона', clean, 'Браузер убирает из микрофона эхо колонок, шум и выравнивает громкость. Выключайте, только если голос звучит странно.');
        ctl.state = el(doc, 'div', 'vc-state');
        box.appendChild(ctl.state);
        pane.appendChild(box);

        ctl.server.addEventListener('change', () => { vc?.setServerMode(ctl.server.value); sync(); });
        ctl.me.addEventListener('change', () => { apply({ me: ctl.me.value }); });
        ctl.vol.addEventListener('input', () => { ctl.volVal.textContent = ctl.vol.value + '%'; apply({ volume: +ctl.vol.value }); });
        ctl.mic.addEventListener('change', () => apply({ mic: ctl.mic.value }));
        ctl.out.addEventListener('change', () => apply({ out: ctl.out.value }));
        ctl.ptt.c.addEventListener('change', () => apply({ ptt: ctl.ptt.c.checked }));
        ctl.sens.addEventListener('input', () => apply({ sens: +ctl.sens.value }));
        for (const k of ['aec', 'ns', 'agc']) ctl[k].c.addEventListener('change', () => apply({ [k]: ctl[k].c.checked }));
    }

    function apply(patch) {
        if (vc) vc.set(patch); else saveSettings({ ...loadSettings(), ...patch });
        sync();
    }

    /** The microphones and outputs the browser knows (their names come once the microphone is allowed). */
    async function devices() {
        if (!box || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
        let list = [];
        try { list = await navigator.mediaDevices.enumerateDevices(); } catch (e) { return; }
        const s = vc ? vc.settings : loadSettings();
        const fill = (sel, kind, cur) => {
            const items = list.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
            const key = items.map((d) => d.deviceId + d.label).join('|');
            if (sel.dataset.key !== key) {
                sel.dataset.key = key;
                sel.length = 1;
                items.forEach((d, i) => sel.appendChild(new Option(d.label || `${kind === 'audioinput' ? 'Микрофон' : 'Выход'} ${i + 1}`, d.deviceId)));
            }
            sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '';
        };
        fill(ctl.mic, 'audioinput', s.mic);
        fill(ctl.out, 'audiooutput', s.out);
    }

    /** Show the current values (the pause menu opens; something changed). */
    function sync() {
        if (!box) return;
        const s = vc ? vc.settings : loadSettings();
        const st = vc?.status() || null;
        box.hidden = !st; // (only in a network game)
        if (!st) return;
        ctl.server.value = st.server;
        ctl.server.disabled = !st.host;
        ctl.serverRow.h.textContent = st.host
            ? `${MODE_HINT[st.server]} Меняется сразу у всех игроков.`
            : `Режим выбирает тот, кто создал сервер. ${MODE_HINT[st.server]}`;
        ctl.me.value = s.me;
        ctl.meRow.r.hidden = st.server === 'off';
        ctl.vol.value = String(s.volume); ctl.volVal.textContent = s.volume + '%';
        const talk = st.mode === 'world' || st.mode === 'radius';
        for (const k of ['volRow', 'micRow', 'pttRow', 'sensRow', 'cleanRow']) ctl[k].r.hidden = !talk;
        ctl.outRow.r.hidden = !talk || !vc?.canChooseOutput;
        ctl.ptt.c.checked = s.ptt;
        ctl.pttRow.h.textContent = s.ptt
            ? `Друзья слышат вас, только пока вы держите клавишу ${keyLabel(s.pttKey)}. Отпустили — микрофон молчит.`
            : `Игра сама передаёт вашу речь, а тишину и шум — нет. Поставьте галочку, если хотите говорить только с зажатой клавишей ${keyLabel(s.pttKey)}.`;
        ctl.sens.value = String(s.sens);
        ctl.aec.c.checked = s.aec; ctl.ns.c.checked = s.ns; ctl.agc.c.checked = s.agc;
        const mic = { denied: '⚠ браузер не дал доступ к микрофону — разрешите его (значок 🔒 в адресной строке): друзья вас пока не слышат', busy: '⚠ микрофон занят другой программой — друзья вас пока не слышат', absent: '⚠ микрофон не найден — друзья вас не слышат, но вы их слышите' }[st.mic];
        const heard = st.peers.filter((p) => p.heard).map((p) => `${p.name}${st.mode === 'radius' ? ` — ${p.gain > 0.001 ? (p.why === 'рядом' ? 'слышно' : p.why) : p.why || 'далеко'}` : ''}`);
        const lines = [];
        if (mic && talk) lines.push(mic);
        if (talk) lines.push(heard.length ? `Вы слышите: ${heard.join(', ')}` : st.peers.length ? 'Соединяемся с друзьями…' : 'Пока на сервере нет других игроков.');
        if (talk && st.relay) lines.push('Часть голосов идёт через компьютер хоста — так бывает при многих игроках или строгом роутере.');
        if (st.mode === 'radius') lines.push(`Друга слышно до ${RADIUS.CUT} м; за стеной и под водой — глуше, в космосе — нет.`);
        if (st.mode === 'own') lines.push('Голос идёт через вашу программу (Discord и т.п.). Игра следит, чтобы голос друга из колонок не колдовал за вас и не говорил с жителями.');
        if (talk || st.mode === 'own') lines.push('С жителями вы говорите как обычно: посмотрите на жителя или назовите его («эй, торговец…») — тогда он поймёт, что вы обращаетесь к нему.');
        ctl.state.textContent = lines.join('\n');
        devices();
    }

    return {
        attach(chat) { vc = chat; if (chat) chat.onChange = () => sync(); sync(); },
        sync,
        /** The mode chosen in «Создать сервер». */
        createMode() { return createSel?.value || 'off'; },
    };
}
