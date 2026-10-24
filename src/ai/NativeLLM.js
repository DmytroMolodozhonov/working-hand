/**
 * NativeLLM.js — the villagers' conversation network as a program of its own on this computer
 * (llm_native.py: llama.cpp's llama-server, below normal priority, on the processor — the video card
 * stays the game's). This object stands in for the old web worker (llm.worker.js): the same messages
 * in and out, so LocalLLM.js talks to either the same way.
 *
 *   const port = await NativeLLMPort.open();   // null: no program here (an old server, another system…)
 */

const base = () => (typeof location !== 'undefined' ? location.href : 'http://localhost/');

export class NativeLLMPort {
    /** The program can run here (server.py has it and this system has a build of it)? */
    /**
     * Started from the menu (main.js): the villagers' net goes to the video card before the game — not in its 15th
     * second, when its upload froze the picture for 1–2 s (the author's journal). The same model the game will ask for.
     */
    static async preload(setting) {
        if (!setting || setting === 'off' || !(await NativeLLMPort.available())) return false;
        try {
            await fetch(new URL('api/llm/load', base()), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: setting === 'gemma4big' ? 'gemma4big' : 'gemma4' }) });
            return true;
        } catch (e) { return false; }
    }

    static async available() {
        if (typeof fetch === 'undefined' || (typeof window !== 'undefined' && window.__ZNS_NO_NATIVE_LLM__)) return false;
        try {
            const r = await fetch(new URL('api/llm/status', base()), { cache: 'no-store' });
            return r.ok && !!(await r.json()).available;
        } catch (e) { return false; }
    }

    constructor() {
        this.onmessage = null;
        this.onerror = null;
        this._streams = new Map(); // job id → AbortController
        this._closed = false;
    }

    _post(m) { try { this.onmessage?.({ data: m }); } catch (e) { console.warn('[NativeLLM]', e); } }

    async _api(path, body) {
        const r = await fetch(new URL('api/llm/' + path, base()), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
    }

    postMessage(msg) {
        if (this._closed || !msg) return;
        if (msg.type === 'load') this._load(msg);
        else if (msg.type === 'generate') this._generate(msg);
        else if (msg.type === 'warm') { if (!this._streams.size) this._generate({ ...msg, type: 'generate', warm: true }); } // (never over an answer)
        else if (msg.type === 'interrupt') { if (!this._streams.has(msg.id)) return; this._streams.get(msg.id).abort(); this._api('interrupt', { id: msg.id }).catch(() => {}); } // (a warm-up already done: nothing to stop)
        else if (msg.type === 'dispose') this.terminate();
    }

    async _load(msg) {
        const key = msg.model?.native || 'gemma4';
        const t0 = Date.now();
        try {
            let st = await (await this._api('load', { model: key })).json();
            while (!this._closed && st.state !== 'ready') {
                if (st.state === 'error') throw new Error(st.error || 'программа нейросети не запустилась');
                this._post({ type: 'progress', fraction: st.progress || 0, text: `Нейросеть на компьютере: ${st.detail || st.state}` });
                await new Promise((r) => setTimeout(r, 700));
                const r = await fetch(new URL('api/llm/status', base()), { cache: 'no-store' });
                st = await r.json();
            }
            this._post({ type: 'progress', fraction: 1, text: 'Нейросеть готова' });
            this._post({ type: 'ready', device: 'native', dtype: 'q4 (llama.cpp, видеокарта)', gpuName: '', ms: st.ms || Date.now() - t0, why: '' });
        } catch (e) {
            this._post({ type: 'load_error', message: String(e?.message || e) });
        }
    }

    async _generate(msg) {
        // (one answer at a time: the program has one place for a talk — an older one, the warm-up, a question
        // that timed out, would only make this one wait; and every open request holds one of the browser's few
        // connections to the game's program — once they ran out, the window thought the game had closed)
        for (const [id, c] of this._streams) {
            c.abort();
            this._streams.delete(id);
            this._post({ type: 'result', id, text: '' });
            this._api('interrupt', { id }).catch(() => {});
        }
        const ctl = new AbortController();
        this._streams.set(msg.id, ctl);
        try {
            const r = await fetch(new URL('api/llm/generate', base()), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg), signal: ctl.signal });
            if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
            const reader = r.body.getReader(), dec = new TextDecoder();
            let buf = '', done = false;
            while (!done) {
                const { value, done: end } = await reader.read();
                if (end) break;
                buf += dec.decode(value, { stream: true });
                let k;
                while ((k = buf.indexOf('\n\n')) >= 0) {
                    const line = buf.slice(0, k).trim();
                    buf = buf.slice(k + 2);
                    if (!line.startsWith('data:')) continue;
                    const m = JSON.parse(line.slice(5));
                    this._post(m);
                    if (m.type === 'result' || m.type === 'gen_error') done = true;
                }
            }
        } catch (e) {
            if (!ctl.signal.aborted) this._post({ type: 'gen_error', id: msg.id, message: String(e?.message || e) });
        } finally {
            this._streams.delete(msg.id);
        }
    }

    terminate() {
        this._closed = true;
        for (const c of this._streams.values()) c.abort();
        this._streams.clear();
    }
}
