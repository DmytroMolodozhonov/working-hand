/**
 * PerfLog.js — a performance diary of the running game, for finding why a
 * computer loses frames. Every 5 s one line: FPS, how long frames take (the
 * middle one, the slow ones, the worst), which part of the frame is heaviest,
 * the camera network (its thread, how often, how long), draw calls, memory,
 * what happened (spells cast, frame spikes and their cause).
 *
 * The lines go to the game's own server (server.py), which writes them into
 * zns-perf.log next to the game — a file the player can just send.
 */

const EVERY = 5000;
/** Once a minute a line about what the game holds («рост»): if something piles up, it shows. */
const GROWTH_EVERY = 60000;

export class PerfLog {
    constructor(game) {
        this.game = game;
        this.gaps = [];
        this.parts = {}; // name -> [sum, max]
        this.events = [];
        this.lines = [];
        this._t0 = performance.now();
        this._last = 0;
        this._spikesSeen = 0;
        this._sendFailed = 0;
        this._header();
    }

    _header() {
        const g = this.game;
        const gpu = globalThis.__zns?.gpu?.name || '';
        const nav = globalThis.navigator || {};
        const c = g.renderer?.domElement;
        this._push(`=== старт ${new Date().toLocaleString('ru-RU')} | режим ${g.config?.mode} | видеокарта: ${gpu || '?'} | ядер ${nav.hardwareConcurrency || '?'}, памяти ${nav.deviceMemory || '?'} ГБ | экран ${globalThis.screen?.width}x${globalThis.screen?.height} ×${globalThis.devicePixelRatio || 1} | холст ${c?.width}x${c?.height} | ${nav.userAgent || ''}`);
    }

    /** Something happened (a spell, a join…): it shows in the next line. */
    note(text) {
        this.events.push(`${((performance.now() - this._t0) / 1000).toFixed(1)}с ${text}`);
        if (this.events.length > 20) this.events.shift();
    }

    /** A talk turn's stopwatch line («разговор: …», TalkTrace): into the diary at once. */
    talk(line) {
        this._push(`${((performance.now() - this._t0) / 1000).toFixed(0)}с | ${line}`);
    }

    /** Every frame: the gap since the last one and the parts of this frame. */
    frame(gapMs, parts) {
        this.gaps.push(gapMs);
        for (const k in parts) {
            const v = parts[k];
            const p = this.parts[k] || (this.parts[k] = [0, 0]);
            p[0] += v;
            if (v > p[1]) p[1] = v;
        }
        const now = performance.now();
        if (now - this._last >= EVERY) { this._last = now; this._line(); }
        else if (now - (this._lastGrowth ?? (this._lastGrowth = now)) >= GROWTH_EVERY) { this._lastGrowth = now; this._growth(); }
    }

    /**
     * «рост»: the objects in the scene, the video card's geometries/textures/shaders, the page's memory,
     * the world's pieces, the creatures — now and since the first such line (+/−). Played long, nothing
     * of these should keep going up; whatever does is named (the scene's top groups that grew most).
     */
    _growth() {
        const g = this.game;
        const groups = {};
        let objects = 0;
        for (const top of g.scene?.children || []) {
            let c = 0;
            top.traverse(() => { c++; });
            objects += c;
            const k = top.name || top.type;
            groups[k] = (groups[k] || 0) + c;
        }
        const info = g.renderer?.info;
        const now = {
            'объектов': objects,
            'геом': info?.memory.geometries ?? 0,
            'текстур': info?.memory.textures ?? 0,
            'шейд': info?.programs?.length ?? 0,
            'память МБ': globalThis.performance?.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0,
            'чанков': g.terrain?.meshes?.size ?? 0,
            'зомби': g.zombies?.length ?? 0,
            'жителей': g.castleLife?.byId?.size ?? 0,
        };
        const first = this._growth0 || (this._growth0 = { now, groups });
        const d = (a, b) => (a - b > 0 ? `+${a - b}` : `${a - b}`);
        const parts = Object.entries(now).map(([k, v]) => `${k} ${v} (${d(v, first.now[k] ?? v)})`);
        const grew = Object.entries(groups).map(([k, v]) => [k, v - (first.groups[k] || 0)]).filter(([, v]) => v > 50)
            .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} +${v}`);
        this._push(`${((performance.now() - this._t0) / 1000).toFixed(0)}с | рост (с начала игры): ${parts.join(', ')}${grew.length ? ' | выросло в сцене: ' + grew.join(', ') : ''}`);
    }

    _line() {
        const g = this.game;
        const n = this.gaps.length;
        if (!n) return;
        const sorted = this.gaps.slice().sort((a, b) => a - b);
        const secs = this.gaps.reduce((a, b) => a + b, 0) / 1000;
        const q = (f) => Math.round(sorted[Math.min(n - 1, Math.floor(n * f))]);
        const parts = Object.entries(this.parts)
            .sort((a, b) => b[1][0] - a[1][0])
            .map(([k, [sum, max]]) => `${k} ${(sum / n).toFixed(1)}/${Math.round(max)}`)
            .join(', ');
        const ps = g.poseService;
        const st = ps?.stats || {};
        const ai = ps ? `ИИ ${st.mode === 'native' ? `отдельная программа (${st.backend || '…'})` : st.mode === 'holistic' ? (st.thread === 'process' ? 'Holistic, отдельный процесс' : 'Holistic, ПОТОК ИГРЫ') : st.mode || '—'} ${st.results != null && this._aiPrev != null && st.results >= this._aiPrev ? `${((st.results - this._aiPrev) / Math.max(secs, 0.001)).toFixed(0)}/с` : ''} ${Math.round(st.avgCost || 0)} мс${st.thread === 'process' && st.latency ? ` (задержка ${st.latency} мс)` : ''}${st.handHelper ? ', помощник рук' : ''}${st.handsEngine === 'v5' ? (st.v5Engine === 'rtm' ? ', кисти V5 (видеокарта)' : ', кисти V5') : ''}${st.delegate ? ', ' + st.delegate : ''}${st.thread === 'main' && st.nativeWhy ? ` (программа-нейросеть: ${st.nativeWhy})` : ''}` : 'ИИ —';
        // counted from the previous line only: the camera outlives a game (a new game in the same page
        // found thousands of its results «in 5 s») and its counter restarts with a new network
        this._aiPrev = st.results ?? null;
        // the voice: which hears (the program on this computer / the browser's Google), the program's time per
        // look at a phrase, and how late after the word the spells came (average / worst)
        const vs = g.voice, nv = vs?.native, vc = nv?.cost, vl = g.stats?.voice;
        const voice = vs ? `голос ${vs.engine === 'native' ? 'на компьютере' : 'в браузере'}${vc?.n ? `, взгляд ${Math.round(vc.sum / vc.n)}/${Math.round(vc.max)} мс` : ''}${vl?.n ? `, заклинания через ${Math.round(vl.sum / vl.n)}/${Math.round(vl.max)} мс после слова (${vl.n}, после конца фразы ${vl.final})` : ''}` : '';
        if (nv) nv.cost = null;
        if (g.stats) g.stats.voice = null;
        const info = g.renderer?.info;
        const mem = globalThis.performance?.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} МБ` : '';
        const spikes = (g.stats?.spikes || []).slice(this._spikesSeen).map((s) => `${s.ms}мс:${s.reason}`);
        this._spikesSeen = (g.stats?.spikes || []).length;
        if (this._spikesSeen >= 30) { g.stats.spikes.length = 0; this._spikesSeen = 0; }
        const line = `${((performance.now() - this._t0) / 1000).toFixed(0)}с | FPS ${(n / Math.max(secs, 0.001)).toFixed(0)} | кадр ${q(0.5)}/${q(0.95)}/${Math.round(sorted[n - 1])} мс (обычн/медл/худш) | ${parts} | ${ai}${voice ? ' | ' + voice : ''} | вызовов ${info?.render.calls ?? '?'}, треуг ${Math.round((info?.render.triangles || 0) / 1000)}k, геом ${info?.memory.geometries ?? '?'}, шейд ${info?.programs?.length ?? '?'} | графика ${g.quality?.current?.name || '?'} | зомби ${g.zombies?.length ?? 0}, жителей ${g.castleLife?.byId?.size ?? 0}, игроков ${(g.remotes?.size ?? 0) + 1}${mem ? ' | память ' + mem : ''}${spikes.length ? ' | рывки: ' + spikes.join(' ') : ''}${this.events.length ? ' | события: ' + this.events.join('; ') : ''}`;
        this.gaps.length = 0;
        this.parts = {};
        this.events.length = 0;
        this._push(line);
    }

    _push(line) {
        this.lines.push(line);
        if (this.lines.length > 400) this.lines.shift();
        this._send(line);
    }

    _send(line) {
        if (this._sendFailed > 3 || typeof fetch === 'undefined' || globalThis.__ZNS_NO_PERFLOG__) return;
        fetch('/api/perflog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line }) })
            .then((r) => { if (!r.ok) this._sendFailed++; })
            .catch(() => { this._sendFailed++; });
    }

    /** Everything so far (to copy by hand if there is no file). */
    text() { return this.lines.join('\n'); }
}
