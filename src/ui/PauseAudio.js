/**
 * PauseAudio.js — the «🔊 Звук» tab of the pause menu (Escape in the game).
 *
 * The sound settings without leaving the game: each control here mirrors one
 * control of the menu's «Настройки → Звук» tab. Changing it sets the original
 * control and fires its own event, so the sound changes at once and the value
 * is remembered exactly as if it was set in the settings.
 */

/** The settings shown in the pause menu (ids of the controls in «Настройки → Звук»). */
export const PAUSE_AUDIO_IDS = ['music-vol', 'zombie-vol', 'spell-vol', 'talk-vol', 'audio-ambient-toggle', 'villager-voice', 'villager-text', 'voice-engine', 'voice-mic', 'voice-filter'];
/** The «🖥 Графика» tab: the same, for «Настройки → Графика». */
export const PAUSE_GRAPHICS_IDS = ['show-fps-toggle', 'view-distance', 'graphics-quality', 'fps-limit', 'antialias'];

function labelOf(src) {
    const lab = src.closest('.settings-group')?.querySelector('label');
    if (!lab) return src.id;
    const copy = lab.cloneNode(true);
    copy.querySelectorAll('span').forEach((s) => s.remove());
    return copy.textContent.replace(/[:\s]+$/, '').trim();
}

/**
 * Builds the rows in `box` for the controls that exist; returns { sync } —
 * call sync() when the pause menu opens to show the current values.
 */
export function setupPauseAudio(box, ids = PAUSE_AUDIO_IDS, doc = document) {
    const rows = [];
    box.innerHTML = '';
    for (const id of ids) {
        const src = doc.getElementById(id);
        if (!src) continue;
        const row = doc.createElement('div');
        row.className = 'pause-audio-row';
        const name = doc.createElement('label');
        name.className = 'pause-audio-label';
        name.textContent = labelOf(src);
        row.appendChild(name);
        let ctl, val = null;
        if (src.type === 'checkbox') {
            ctl = doc.createElement('input');
            ctl.type = 'checkbox';
        } else if (src.tagName === 'SELECT') {
            ctl = doc.createElement('select');
            for (const o of src.options) ctl.appendChild(new Option(o.textContent, o.value));
        } else {
            ctl = doc.createElement('input');
            ctl.type = 'range';
            ctl.min = src.min; ctl.max = src.max; ctl.step = src.step || '1';
            val = doc.createElement('span');
            val.className = 'pause-audio-val';
        }
        ctl.id = 'pause-' + id;
        ctl.dataset.for = id;
        name.htmlFor = ctl.id;
        const evt = src.tagName === 'SELECT' || src.type === 'checkbox' ? 'change' : 'input';
        ctl.addEventListener(evt, () => {
            if (src.type === 'checkbox') src.checked = ctl.checked; else src.value = ctl.value;
            src.dispatchEvent(new Event(evt, { bubbles: true }));
            if (val) val.textContent = ctl.value + '%';
        });
        // (keys pressed on a control must not move the hero or reach the game)
        ctl.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
        const line = doc.createElement('div');
        line.className = 'pause-audio-ctl';
        line.appendChild(ctl);
        if (val) line.appendChild(val);
        row.appendChild(line);
        const hint = src.closest('.settings-group')?.querySelector('.setting-hint');
        let h = null;
        if (hint) {
            h = doc.createElement('div');
            h.className = 'pause-audio-hint';
            h.textContent = hint.textContent;
            row.appendChild(h);
        }
        box.appendChild(row);
        rows.push({ src, ctl, val, hint, h });
    }
    const sync = () => {
        for (const r of rows) {
            // (a list filled later — the microphones found — is copied again when it changed)
            if (r.src.tagName === 'SELECT' && [...r.src.options].map((o) => o.value + o.textContent).join('|') !== [...r.ctl.options].map((o) => o.value + o.textContent).join('|')) {
                r.ctl.innerHTML = '';
                for (const o of r.src.options) r.ctl.appendChild(new Option(o.textContent, o.value));
            }
            if (r.src.type === 'checkbox') r.ctl.checked = r.src.checked; else r.ctl.value = r.src.value;
            if (r.h) r.h.textContent = r.hint.textContent; // (a hint that tells the state: «слушается сейчас…»)
            if (r.val) r.val.textContent = r.src.value + '%';
        }
    };
    sync();
    return { sync, count: rows.length };
}
