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
        const ai = ps ? `ИИ ${st.thread === 'worker' ? 'свои потоки (тело+лицо | руки)' : st.thread === 'main' ? 'ПОТОК ИГРЫ' : st.mode || '—'} ${st.results != null ? `${((st.results - (this._aiPrev || 0)) / Math.max(secs, 0.001)).toFixed(0)}/с` : ''} ${Math.round(st.avgCost || 0)} мс${st.latency && st.thread === 'worker' ? ` (задержка ${st.latency} мс)` : ''}${st.handHelper ? ', помощник рук' : ''}${st.delegate ? ', ' + st.delegate : ''}${st.why && st.thread === 'main' ? ` (почему: ${st.why})` : ''}` : 'ИИ —';
        this._aiPrev = st.results || 0;
        const info = g.renderer?.info;
        const mem = globalThis.performance?.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} МБ` : '';
        const spikes = (g.stats?.spikes || []).slice(this._spikesSeen).map((s) => `${s.ms}мс:${s.reason}`);
        this._spikesSeen = (g.stats?.spikes || []).length;
        if (this._spikesSeen >= 30) { g.stats.spikes.length = 0; this._spikesSeen = 0; }
        const line = `${((performance.now() - this._t0) / 1000).toFixed(0)}с | FPS ${(n / Math.max(secs, 0.001)).toFixed(0)} | кадр ${q(0.5)}/${q(0.95)}/${Math.round(sorted[n - 1])} мс (обычн/медл/худш) | ${parts} | ${ai} | вызовов ${info?.render.calls ?? '?'}, треуг ${Math.round((info?.render.triangles || 0) / 1000)}k, геом ${info?.memory.geometries ?? '?'}, шейд ${info?.programs?.length ?? '?'} | графика ${g.quality?.current?.name || '?'} | зомби ${g.zombies?.length ?? 0}, жителей ${g.castleLife?.byId?.size ?? 0}, игроков ${(g.remotes?.size ?? 0) + 1}${mem ? ' | память ' + mem : ''}${spikes.length ? ' | рывки: ' + spikes.join(' ') : ''}${this.events.length ? ' | события: ' + this.events.join('; ') : ''}`;
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
