/**
 * PoseService.js — webcam → neural networks → game input.
 *
 * Pipeline per camera frame:
 *   video frame → ImageBitmap → Web Worker (MediaPipe Tasks: pose, hands, face)
 *   → TrackingGuard (assignment, anomaly rejection, smoothing)
 *   → PoseInterpreter (arms, run, punch, crouch, head) → onPoseUpdate(poseData)
 *
 * Only one frame is ever in flight, so a slow computer drops camera frames
 * instead of freezing the game. If the worker cannot start, the same models
 * run on the main thread (slower, but still works).
 */

import { WristTrace } from '../game/ThrowModel.js';
import { assignHands, HandStabilizer, PoseStabilizer } from './TrackingGuard.js';
import { PoseInterpreter } from './PoseInterpreter.js';
import { matchSticks } from './RealStick.js';
import { detectStick } from './StickDetector.js';

const POSE_LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const HAND_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]];

// Auto mode: above this many ms per camera frame on the CPU (< ~12 recognitions/s), use the graphics card
const AUTO_GPU_ABOVE_MS = 85;
// Minimum ms between Holistic runs (it runs on the game's own thread)
const HOLISTIC_INTERVAL = 44;

export class PoseService {
    constructor({ faceSolver = null, baseUrl = null } = {}) {
        this.baseUrl = baseUrl || new URL('../../', import.meta.url).href;
        this.faceSolver = faceSolver;
        this.videoElement = null;
        this.previewElement = null;
        this.skeletonCanvas = null;
        this.stream = null;
        this.isRunning = false;
        this.ready = false;
        this.onPoseUpdate = null;
        this.onStatus = null;
        this.worker = null;
        this.runner = null; // main-thread fallback
        this.inFlight = false;
        this.handGuards = { left: new HandStabilizer(), right: new HandStabilizer() };
        this.poseGuard = new PoseStabilizer();
        this.interpreter = new PoseInterpreter(faceSolver);
        this.stats = { frames: 0, results: 0, avgCost: 0, delegate: null, mode: null, lastResultAt: 0 };
        this._lastFace = null;
        this._lastDraw = 0;
        this._quality = 1;
        this._delegate = null; // null = auto
        this.injected = false; // tests / replay can inject poses instead of the camera
        // a real stick in a hand, looked for in the browser's own camera picture while the
        // game wants it ({left, right}: a wand in that hand) — the native program sends its own
        this.wantSticks = null;
        this.recordSink = null; // (the hand recording, F9: every raw camera result)
        this.browserSticks = (l, r) => this._browserSticks(l, r);
        // which hands the camera program finds: '' (MediaPipe's own, V2–V4) or 'v5' (hand_v5.py:
        // the hands cut out where the body has them). onNotice: a line for the player (V5 couldn't).
        this.handsWanted = '';
        this.onNotice = null;
        this._noticed = '';
    }

    _status(text) {
        if (this.onStatus) this.onStatus(text);
    }

    /**
     * @param {string} videoElementId
     * @param {string} previewElementId
     * @param {object} config {modelComplexity, resolution}
     */
    async initialize(videoElementId, previewElementId, config = {}) {
        this.videoElement = document.getElementById(videoElementId);
        this.previewElement = document.getElementById(previewElementId);
        this.skeletonCanvas = document.getElementById('skeleton-canvas');
        const quality = config.modelComplexity !== undefined ? parseInt(config.modelComplexity, 10) : 1;

        const delegate = config.delegate === 'GPU' || config.delegate === 'CPU' ? config.delegate : null;
        // 'classic' = MediaPipe Holistic exactly as in the original game (default), 'tasks' = 3 separate networks
        const engine = config.engine || this._engine || globalThis.__ZNS_ENGINE__ || 'classic';
        if (config.handVersion !== undefined) this._setHands(config.handVersion === 'v5' ? 'v5' : '');
        if (this.ready && quality === this._quality && engine === this._engine && (config.delegate === undefined || delegate === this._delegate)) return;
        this._quality = quality;
        this._engine = engine;
        if (config.delegate !== undefined) this._delegate = delegate;
        // The network as a program of its own next to the game (pose_native.py, started by
        // server.py): native MediaPipe looks at the camera itself, the game only gets the
        // points — it never waits for the network. If it isn't installed: the browser's one.
        if ((engine === 'classic' || engine === 'classic-main') && !globalThis.__ZNS_NO_NATIVE__ && await this._nativeAvailable()) {
            this._closeModels();
            this.native = { quality };
            this.stats.mode = 'native';
            this.stats.thread = 'program';
            this.ready = true;
            return;
        }
        this.native = null;
        if (this.handsWanted.startsWith('v5')) this._notice('Кисти V5 работают только с отдельной программой камеры — пока работают кисти V4');
        if (engine === 'classic' || engine === 'classic-main') {
            try {
                await this._startHolistic(quality, engine === 'classic-main');
            } catch (e) {
                console.warn('[PoseService] Holistic failed, using the new networks:', e?.message || e);
                this._engine = 'tasks';
                await this._startModels(quality);
            }
        } else {
            await this._startModels(quality);
        }

        let width = 640, height = 480;
        if (config.resolution) {
            const [w, h] = String(config.resolution).split('x').map((n) => parseInt(n, 10));
            if (w && h) { width = w; height = h; }
        }
        this._resolution = { width, height };
        this.ready = true;
    }

    /**
     * The original game's recognition: one MediaPipe Holistic network (pose,
     * hands, face together) with its built-in landmark smoothing — the
     * smooth, steady feel the game was tuned with.
     *
     * It runs in a separate browser process: the page ai.html, opened from the
     * other name of this computer (localhost ↔ 127.0.0.1) in an invisible frame.
     * The browser gives a page from another site its own process, so the ~45 ms
     * Holistic spends on each camera picture no longer stop the game (measured on
     * an RTX 3050 PC: on the game's thread every recognition froze the game for
     * 70–80 ms). On the game's thread only if that can't start.
     */
    async _startHolistic(quality, onGameThread = false) {
        this._closeModels();
        this._status('Загрузка нейросети...');
        const dir = this.baseUrl + 'vendor/mediapipe-holistic/';
        this._holisticDir = dir;
        let started = false;
        // (a separate process kept the game at 75 FPS on an RTX 3050 PC, but there Holistic
        // managed only 3–4 pictures a second — worse to play. Off until that is solved;
        // window.__ZNS_AI_PROCESS__ = true turns it on for trying.)
        if (onGameThread || globalThis.__ZNS_HOLISTIC_MAIN__ || !globalThis.__ZNS_AI_PROCESS__) this.stats.why = 'в отдельном процессе слишком медленно (3–4 кадра/с), поэтому поток игры';
        else {
            try {
                await this._startHolisticFrame(quality);
                started = true;
            } catch (e) {
                this.stats.why = 'отдельный процесс не запустился: ' + String(e?.message || e).slice(0, 120);
                console.warn('[PoseService] ' + this.stats.why);
            }
        }
        if (!started) await this._startHolisticMain(dir, quality);
        this._startHandHelper(quality);
    }

    /** The other name of this computer (another "site" for the browser → another process). */
    _otherOrigin() {
        const u = new URL(this.baseUrl);
        if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
        else if (u.hostname === '127.0.0.1') u.hostname = 'localhost';
        else return null;
        return u;
    }

    _startHolisticFrame(quality) {
        return new Promise((resolve, reject) => {
            const other = this._otherOrigin();
            if (!other) { reject(new Error('игра открыта не с этого компьютера')); return; }
            const frame = document.createElement('iframe');
            // (tiny but on the screen: the browser slows down frames nobody can see)
            frame.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;border:0;opacity:0.01;pointer-events:none;z-index:1';
            frame.setAttribute('aria-hidden', 'true');
            frame.src = new URL('ai.html', other).href;
            const origin = other.origin;
            const timeout = setTimeout(() => { cleanup(); frame.remove(); reject(new Error('нет ответа')); }, 60000);
            const onMsg = (ev) => {
                if (ev.source !== frame.contentWindow || ev.origin !== origin) return;
                const m = ev.data;
                if (!m || !m.zns) return;
                if (this.holisticFrame === frame) { this._onHolisticFrame(m); return; }
                if (m.zns === 'ready') {
                    clearTimeout(timeout);
                    this.holisticFrame = frame;
                    this._frameOrigin = origin;
                    this.stats.mode = 'holistic';
                    this.stats.thread = 'process';
                    this.stats.delegate = 'GPU';
                    resolve();
                } else if (m.zns === 'error') {
                    clearTimeout(timeout);
                    cleanup();
                    frame.remove();
                    reject(new Error(m.message));
                }
            };
            const cleanup = () => window.removeEventListener('message', onMsg);
            this._frameCleanup = () => { cleanup(); frame.remove(); };
            window.addEventListener('message', onMsg);
            frame.addEventListener('load', () => frame.contentWindow.postMessage({ zns: 'init', quality }, origin));
            document.body.appendChild(frame);
        });
    }

    _onHolisticFrame(m) {
        if (m.zns === 'result' || m.zns === 'dropped' || m.zns === 'error') this._hfOut = Math.max(0, (this._hfOut || 0) - 1);
        if (m.zns === 'result') {
            this.lastSendEnd = performance.now();
            if (m.cost) this.stats.avgCost = this.stats.avgCost ? this.stats.avgCost * 0.9 + m.cost * 0.1 : m.cost;
            this.stats.latency = Math.round(performance.now() - m.ts);
            if (!m.empty) this._onHolistic(m);
        } else if (m.zns === 'error') {
            this._frameErrors = (this._frameErrors || 0) + 1;
            if (this._frameErrors < 5) console.warn('[PoseService] Holistic (separate process) frame failed:', m.message);
        }
    }

    async _startHolisticMain(dir, quality) {
        this.stats.thread = 'main';
        if (!globalThis.Holistic) await loadScript(dir + 'holistic.js');
        const holistic = new globalThis.Holistic({ locateFile: (file) => dir + file });
        holistic.setOptions({
            // «Качество ИИ» in the settings: Lite / Full (default) / Heavy (the original's choice,
            // heavier on the game: the network runs on the game's own thread)
            modelComplexity: Math.max(0, Math.min(2, quality)),
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: false,
            refineFaceLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
        holistic.onResults((r) => this._onHolistic(r));
        await holistic.initialize();
        this.holistic = holistic;
        this.stats.mode = 'holistic';
        this.stats.delegate = 'GPU';
    }

    _startHandHelper(quality) {
        const owner = this.holistic;
        // Hand helper: the newer Hand Landmarker in a worker finds hands that
        // Holistic loses (hand over the arm / body). Optional — Holistic alone works too.
        if (typeof Worker !== 'undefined' && !globalThis.__ZNS_NO_HAND_HELPER__) {
            this._spawnWorker(quality, 'CPU', true).then((w) => {
                if (this.holistic !== owner) { w.terminate(); return; }
                this.handWorker = w;
                this.stats.handHelper = true;
            }).catch((e) => console.warn('[PoseService] hand helper unavailable:', e?.message || e));
        }
    }

    _onHolistic(results) {
        if (this.recordSink) this.recordSink(results);
        this.stats.results++;
        this.stats.lastResultAt = performance.now();
        const r = {
            poseLandmarks: results.poseLandmarks || null,
            faceLandmarks: results.faceLandmarks || null,
            leftHandLandmarks: results.leftHandLandmarks || null,
            rightHandLandmarks: results.rightHandLandmarks || null,
        };
        // A hand Holistic lost: take it from the hand helper (fresh results only).
        // The helper only works while a hand is missing (it costs CPU).
        if (!r.leftHandLandmarks || !r.rightHandLandmarks) this._handMissingAt = performance.now();
        const helper = this._helperHands;
        if (helper && (!r.leftHandLandmarks || !r.rightHandLandmarks) && performance.now() - helper.at < 250) {
            const assigned = assignHands(helper.hands, r.poseLandmarks);
            if (!r.leftHandLandmarks && assigned.left) { r.leftHandLandmarks = assigned.left; this.stats.helperHands = (this.stats.helperHands || 0) + 1; }
            if (!r.rightHandLandmarks && assigned.right) { r.rightHandLandmarks = assigned.right; this.stats.helperHands = (this.stats.helperHands || 0) + 1; }
        }
        this.lastResults = r;
        this._drawSkeleton(r);
        if (this.onPoseUpdate) this.onPoseUpdate(this._withSticks(this.interpreter.process(r, this.native ? this._nativeVideo : this.videoElement), results.sticks, r.leftHandLandmarks, r.rightHandLandmarks));
    }

    /** The browser's own look for a real stick round the hands (StickDetector.js), ≤ 20 a second. */
    _browserSticks(leftLm, rightLm) {
        const want = this.wantSticks, v = this.videoElement;
        if (!want || (!want.left && !want.right) || this.native || this.injected || !v || !(v.videoWidth > 0) || typeof document === 'undefined') return null;
        const now = performance.now();
        if (now - (this._stickAt || 0) < 50) return this._lastSticks;
        this._stickAt = now;
        const out = [];
        const VW = v.videoWidth, VH = v.videoHeight;
        try {
            for (const [side, lm] of [['left', leftLm], ['right', rightLm]]) {
                if (!want[side] || !lm || lm.length < 21) continue;
                const px = lm.map((p) => ({ x: p.x * VW, y: p.y * VH }));
                const palm = Math.hypot(px[0].x - px[9].x, px[0].y - px[9].y) + 0.5 * Math.hypot(px[5].x - px[17].x, px[5].y - px[17].y);
                if (!(palm > 12)) continue;
                let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                for (const p of px) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
                const m = palm * 3.1;
                x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m));
                x1 = Math.min(VW, Math.ceil(x1 + m)); y1 = Math.min(VH, Math.ceil(y1 + m));
                const k = Math.min(1, 40 / palm); // (a palm of ~40 pixels is plenty)
                const w = Math.max(8, Math.round((x1 - x0) * k)), h = Math.max(8, Math.round((y1 - y0) * k));
                const c = this._stickCanvas || (this._stickCanvas = document.createElement('canvas'));
                if (c.width < w) c.width = w;
                if (c.height < h) c.height = h;
                const ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(v, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
                const rgba = ctx.getImageData(0, 0, w, h).data;
                const g = this._stickGrey && this._stickGrey.length >= w * h ? this._stickGrey : (this._stickGrey = new Uint8Array(w * h * 2));
                for (let i = 0, j = 0; i < w * h; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
                const s = detectStick(g, w, h, px.map((p) => ({ x: (p.x - x0) * k, y: (p.y - y0) * k })));
                if (s) out.push({ wrist: [lm[0].x, lm[0].y], ...s });
            }
        } catch (e) {
            this.wantSticks = null; // (a picture the browser won't read: never break the camera)
        }
        this._lastSticks = out;
        return out;
    }

    /** A real stick seen in a hand (RealStick.js): poseData.leftHandStick / rightHandStick. */
    _withSticks(data, sticks, leftLm, rightLm) {
        if (!data) return data;
        if (!sticks?.length && this.browserSticks) sticks = this.browserSticks(leftLm, rightLm);
        if (sticks?.length) {
            const m = matchSticks(sticks, leftLm, rightLm);
            if (m.left) data.leftHandStick = m.left;
            if (m.right) data.rightHandStick = m.right;
        }
        return data;
    }

    async _startModels(quality) {
        this._closeModels();
        this._status('Загрузка нейросети...');
        if (typeof Worker !== 'undefined' && !globalThis.__ZNS_NO_WORKER__) {
            try {
                await this._startWorker(quality);
                this.stats.mode = 'worker';
                return;
            } catch (e) {
                console.warn('[PoseService] worker failed, using main thread:', e?.message || e);
            }
        }
        const { VisionRunner } = await import('./VisionRunner.js');
        this.runner = new VisionRunner(this.baseUrl);
        // Main thread: classic loader script (the module loader needs a module worker)
        const info = await this.runner.init({ quality, useModule: false });
        this.stats.delegate = info.delegate;
        this.stats.mode = 'main';
    }

    /**
     * Which processor runs the networks. Auto = the CPU in the worker thread:
     * then the graphics card only draws the game (three networks on the
     * graphics card compete with the game for it and cost FPS). If this
     * computer's CPU turns out too slow, auto switches to the graphics card.
     */
    _workerDelegate() {
        return globalThis.__ZNS_DELEGATE__ || this._delegate || this._autoDelegate || 'CPU';
    }

    /** Auto mode: CPU too slow for smooth tracking → move to the graphics card once. */
    _checkAutoDelegate() {
        if (this._delegate || globalThis.__ZNS_DELEGATE__ || this._autoDelegate || !this.worker) return;
        if (this.stats.delegate !== 'CPU' || this.stats.results < 90) return;
        if (this.stats.avgCost < AUTO_GPU_ABOVE_MS) return;
        this._autoDelegate = 'GPU';
        console.info(`[PoseService] CPU inference ${this.stats.avgCost.toFixed(0)} ms — switching to the graphics card`);
        const old = this.worker;
        // Keep tracking with the old worker until the new one is ready
        this._spawnWorker(this._quality, 'GPU').then((w) => {
            if (this.worker !== old) { w.terminate(); return; }
            old.postMessage({ type: 'close' });
            old.terminate();
            this.worker = w;
            this.inFlight = false;
        }).catch((e) => console.warn('[PoseService] GPU switch failed:', e?.message || e));
    }

    async _startWorker(quality) {
        this.worker = await this._spawnWorker(quality, this._workerDelegate());
    }

    _spawnWorker(quality, delegate, handsOnly = false) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./vision.worker.js', import.meta.url), { type: 'module' });
            const timeout = setTimeout(() => { worker.terminate(); reject(new Error('worker init timeout')); }, 60000);
            worker.onmessage = (ev) => {
                const msg = ev.data;
                if (msg.type === 'ready') {
                    clearTimeout(timeout);
                    if (!handsOnly) {
                        this.stats.delegate = msg.delegate;
                        this.stats.avgCost = 0;
                        this.stats.results = 0;
                    }
                    worker.onmessage = handsOnly
                        ? (e) => this._onHandHelper(e.data)
                        : (e) => { if (e.target === this.worker || this.worker === null) this._onWorkerMessage(e.data); };
                    resolve(worker);
                } else if (msg.type === 'error') {
                    clearTimeout(timeout);
                    worker.terminate();
                    reject(new Error(msg.message));
                }
            };
            worker.onerror = (e) => { clearTimeout(timeout); worker.terminate(); reject(new Error(e.message || 'worker error')); };
            worker.postMessage({ type: 'init', baseUrl: this.baseUrl, quality, delegate, handsOnly });
        });
    }

    _onHandHelper(msg) {
        this.handInFlight = false;
        if (msg.type === 'result') this._helperHands = { hands: msg.result.hands || [], at: performance.now() };
    }

    _onWorkerMessage(msg) {
        if (msg.type === 'result') {
            this.inFlight = false;
            this._handleResult(msg.result);
            this._checkAutoDelegate();
        } else if (msg.type === 'error') {
            this.inFlight = false;
            if (msg.during === 'frame') this._frameErrors = (this._frameErrors || 0) + 1;
            if (this._frameErrors > 30) console.warn('[PoseService] repeated frame errors:', msg.message);
        }
    }

    _closeModels() {
        if (this.holistic) { try { this.holistic.close(); } catch (e) { /* ignore */ } this.holistic = null; }
        if (this.holisticFrame) {
            try { this.holisticFrame.contentWindow.postMessage({ zns: 'close' }, this._frameOrigin); } catch (e) { /* ignore */ }
            this._frameCleanup?.();
            this.holisticFrame = null;
        }
        this._hfOut = 0;

        if (this.handWorker) { this.handWorker.terminate(); this.handWorker = null; }
        this._helperHands = null;
        if (this.worker) { this.worker.postMessage({ type: 'close' }); this.worker.terminate(); this.worker = null; }
        if (this.runner) { this.runner.close(); this.runner = null; }
        this.inFlight = false;
    }

    /** Is the camera network program there (mediapipe installed next to server.py)? */
    async _nativeAvailable() {
        try {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 3000);
            const r = await fetch(new URL('api/pose/status', this.baseUrl), { signal: ctl.signal });
            clearTimeout(t);
            const st = await r.json();
            if (!st.available) this.stats.nativeWhy = st.error || 'нет программы';
            return !!st.available;
        } catch (e) {
            this.stats.nativeWhy = 'сервер игры не отвечает';
            return false;
        }
    }

    /** The program looks at the camera; its points arrive as a stream. False if it can't. */
    _startNative() {
        return new Promise((resolve) => {
            this._status('Нейросеть камеры (отдельная программа) запускается...');
            const hands = this.handsWanted;
            const es = new EventSource(new URL(`api/pose/stream?q=${this.native.quality}${hands ? '&hands=' + hands : ''}`, this.baseUrl));
            es._hands = hands;
            let first = true;
            const timeout = setTimeout(() => { if (first) { es.close(); this.stats.nativeWhy = 'программа не ответила за 40 с'; resolve(false); } }, 40000);
            es.onmessage = (ev) => {
                if (first) { first = false; clearTimeout(timeout); this._native = es; resolve(true); }
                // Only the NEWEST result is used. While the game is busy (in flight it builds the world),
                // the results pile up waiting for it; taken one by one, oldest first, the hands showed
                // what they did seconds ago. Now a waiting one is replaced by the newer, never queued.
                if (this._nativeData != null) this.stats.nativeSkipped = (this.stats.nativeSkipped || 0) + 1;
                this._nativeData = ev.data;
                if (this._nativeTimer) return;
                this._nativeTimer = setTimeout(() => {
                    this._nativeTimer = 0;
                    const data = this._nativeData;
                    this._nativeData = null;
                    let r;
                    try { r = JSON.parse(data); } catch (e) { return; }
                    if (this._native === es) this._onNative(r);
                }, 0);
            };
            es.addEventListener('fail', (ev) => {
                let msg = '';
                try { msg = JSON.parse(ev.data).error; } catch (e) { /* ignore */ }
                this.stats.nativeWhy = msg || 'ошибка программы';
                console.warn('[PoseService] camera network program:', this.stats.nativeWhy);
                es.close();
                if (first) { first = false; clearTimeout(timeout); resolve(false); }
            });
            es.onerror = () => { if (es.readyState === EventSource.CLOSED && first) { first = false; clearTimeout(timeout); resolve(false); } };
        });
    }

    _onNative(r) {
        this.stats.lastResultAt = performance.now();
        if (r.cost) this.stats.avgCost = this.stats.avgCost ? this.stats.avgCost * 0.9 + r.cost * 0.1 : r.cost;
        this.stats.backend = r.backend;
        this.stats.handsEngine = r.handsEngine || 'mp';
        this.stats.v5Engine = r.v5Engine || null; // ('gpu': the video card, 'cpu': the processor)
        // V5 asked for, but the program found the hands its old way: say so, once (honestly)
        if (this.handsWanted.startsWith('v5') && r.handsEngine !== 'v5' && r.v5) {
            const busy = r.v5 === 'устанавливается' || r.v5 === 'загружается';
            this._notice(busy ? `Кисти V5 ${r.v5} — пока работают кисти V4` : `Кисти V5 не запустились (${r.v5}) — работают кисти V4`);
        } else if (this.handsWanted.startsWith('v5') && r.handsEngine === 'v5' && this._noticed && !this._noticed.startsWith('Кисти V5 включились')) this._notice('Кисти V5 включились');
        this._nativeVideo = { videoWidth: r.w || 640, videoHeight: r.h || 480 };
        // a far or badly lit player (3 s of a weak body): say so, kindly and not often
        this.stats.farZoom = r.zoom || 1;
        if (r.farHint && performance.now() - (this._farHintAt || -1e9) > 60000) {
            this._farHintAt = performance.now();
            this.onNotice?.('Подойдите чуть ближе к камере — вас плохо видно');
        }
        // (the picture's own time, not when it reached the game: the hand filters see its real speed
        // even when results come unevenly — the program's clock is this computer's)
        const age = r.t ? Math.max(0, Math.min(500, Date.now() - r.t)) : 0;
        this.stats.handAge = age;
        // (the journal «Руки»: where the picture's time went in the program — waited, the networks, the rest — and the camera's own rate)
        if (r.st) this.stats.stages = r.st;
        if (r.camFps != null) this.stats.camFps = r.camFps;
        const ts = this._nativeTs = Math.max((this._nativeTs || 0) + 1, performance.now() - age); // (never back in time)
        if (r.hands) this._handleResult({ ts, cost: r.cost, poseLandmarks: r.poseLandmarks, hands: r.hands, faceLandmarks: r.faceLandmarks, sticks: r.sticks });
        else this._onHolistic(r);
    }

    /**
     * The program wasn't there when the game started (MediaPipe was being installed):
     * keep asking the server, and the moment it can run — switch to it, in the game.
     */
    _watchForNative() {
        if (this._nativeWatch || globalThis.__ZNS_NO_NATIVE__ || !(this._engine === 'classic' || this._engine === 'classic-main')) return;
        this._nativeWatch = setInterval(async () => {
            if (this.native || !this.isRunning || this._switching) return;
            if (!(await this._nativeAvailable())) return;
            this._switching = true;
            clearInterval(this._nativeWatch);
            this._nativeWatch = null;
            const q = this._quality;
            // let the browser's camera and network go: the program opens the camera itself
            if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); this.stream = null; }
            this._closeModels();
            this.native = { quality: q };
            this.stats.mode = 'native';
            this.stats.thread = 'program';
            if (await this._startNative()) console.info('[PoseService] switched to the camera network program');
            else {
                // (it couldn't after all: the browser's network again)
                this.native = null;
                await this._startHolistic(q, false);
                this.isRunning = false;
                await this.start();
            }
            this._switching = false;
        }, 5000);
    }

    async start() {
        if (this.isRunning) return;
        if (this.native) {
            if (await this._startNative()) { this.isRunning = true; return; }
            // the program couldn't (no camera for it, an error): the browser's network as before
            console.warn('[PoseService] camera network program unavailable, using the browser:', this.stats.nativeWhy);
            // (said to the player: the browser's network runs on the game's own thread — the game slows down)
            if (!this.handsWanted.startsWith('v5')) this._notice(`Нейросеть камеры работает в браузере — игра медленнее (${this.stats.nativeWhy || 'программа камеры не запустилась'})`);
            if (this.handsWanted.startsWith('v5')) this._notice(`Кисти V5 не запустились (нет программы камеры: ${this.stats.nativeWhy || 'ошибка'}) — работают кисти V4`);
            const q = this.native.quality;
            this.native = null;
            await this._startHolistic(q, false);
        }
        if (!this.stream) {
            this._status('Включение камеры...');
            this.stream = await this._openCamera();
            if (this.previewElement) {
                // Reuse the same camera stream for the preview (the original opened the camera twice)
                this.previewElement.srcObject = this.stream;
                this.previewElement.play().catch(() => {});
            }
        }
        this.isRunning = true;
        this._pump();
        this._watchForNative();
    }

    /** All cameras of this computer (names appear once the camera is allowed). */
    static async listCameras() {
        if (!navigator.mediaDevices?.enumerateDevices) return [];
        try {
            return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        } catch (e) { return []; }
    }

    /**
     * Finds a camera that really works, in any browser: the camera chosen last
     * time, the usual request, "any camera", then every camera one by one (a
     * virtual or broken default camera is common). A camera that opens but
     * shows nothing is skipped too. Throws the most telling error.
     */
    async _openCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw Object.assign(new Error('Браузер не даёт камеру на этом адресе'), { name: 'InsecureError' });
        }
        const { width, height } = this._resolution || { width: 640, height: 480 };
        const size = { width: { ideal: width }, height: { ideal: height } };
        let saved = this.cameraId || null;
        if (!saved) { try { saved = localStorage.getItem('zns-camera-id'); } catch (e) { /* ignore */ } }
        const tries = [];
        if (saved) tries.push({ ...size, deviceId: { exact: saved } });
        tries.push({ ...size, facingMode: 'user' }, true);
        let lastErr = null, listed = false;
        for (let i = 0; i < tries.length; i++) {
            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: tries[i], audio: false });
                if (await this._attach(stream)) {
                    const id = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
                    if (id) { try { localStorage.setItem('zns-camera-id', id); } catch (e) { /* ignore */ } }
                    return stream;
                }
                lastErr = Object.assign(new Error('Камера включилась, но не показывает картинку'), { name: 'NoFramesError' });
            } catch (e) {
                lastErr = e;
                // Forbidden by the browser or Windows: other cameras won't help
                if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;
            }
            if (stream) for (const t of stream.getTracks()) t.stop();
            if (i === tries.length - 1 && !listed) {
                listed = true;
                for (const c of await PoseService.listCameras()) {
                    if (c.deviceId && c.deviceId !== saved) tries.push({ deviceId: { exact: c.deviceId } });
                }
            }
        }
        throw lastErr || Object.assign(new Error('Камера не найдена'), { name: 'NotFoundError' });
    }

    /** Shows the stream in the video element; false if no picture comes within 4 s. */
    async _attach(stream) {
        const v = this.videoElement;
        v.srcObject = stream;
        v.muted = true;
        await v.play().catch(() => {});
        const t0 = performance.now();
        while (!(v.videoWidth > 0) && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100));
        return v.videoWidth > 0;
    }

    /** Use another camera (from the camera panel or the settings). */
    async switchCamera(deviceId) {
        this.cameraId = deviceId || null;
        try { if (deviceId) localStorage.setItem('zns-camera-id', deviceId); else localStorage.removeItem('zns-camera-id'); } catch (e) { /* ignore */ }
        const wasRunning = this.isRunning;
        if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); this.stream = null; }
        this.isRunning = false;
        if (wasRunning) await this.start();
    }

    /** The game's frames a second (set by the game). The camera program is told it: results faster
     * than the game's frames are never used (only the newest is), so it then works no faster —
     * the processor stays for the game (in flight it builds the world). */
    get gameFps() { return this._gameFps; }

    set gameFps(fps) {
        this._gameFps = fps;
        if (!this._native || !this.native) return;
        const now = performance.now();
        if (Math.abs(fps - (this._pacedFps || 0)) < 4 && now - (this._pacedAt || 0) < 3000) return;
        this._pacedFps = fps;
        this._pacedAt = now;
        fetch(new URL(`api/pose/pace?fps=${Math.round(fps)}`, this.baseUrl)).catch(() => {});
    }

    /** The hand finder for the camera program ('' or 'v5' — on the video card by itself); a running stream is reopened with it. */
    _setHands(hands) {
        if (hands === this.handsWanted) return;
        this.handsWanted = hands;
        this._noticed = '';
        if (hands.startsWith('v5') && this.ready && !this.native) this._notice('Кисти V5 работают только с отдельной программой камеры — пока работают кисти V4');
        if (this._native && this._native._hands !== hands && this.isRunning) {
            this._native.close();
            this._native = null;
            this._startNative().then((ok) => { if (!ok) console.warn('[PoseService] camera network program: reopen failed'); });
        }
    }

    _notice(text) {
        if (this._noticed === text) return;
        this._noticed = text;
        console.warn('[PoseService]', text);
        this.onNotice?.(text);
    }

    stop() {
        this.isRunning = false;
        if (this._native) { this._native.close(); this._native = null; }
    }

    close() {
        this.stop();
        if (this.stream) {
            for (const t of this.stream.getTracks()) t.stop();
            this.stream = null;
        }
        this._closeModels();
        this.ready = false;
    }

    _pump() {
        if (!this.isRunning) return;
        const v = this.videoElement;
        const gen = (this._pumpGen = (this._pumpGen || 0) + 1); // one loop only, even after a camera switch
        const next = () => {
            if (!this.isRunning || gen !== this._pumpGen) return;
            if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => { this._onVideoFrame(); next(); });
            else requestAnimationFrame(() => { this._onVideoFrame(); next(); });
        };
        next();
    }

    async _onVideoFrame() {
        const v = this.videoElement;
        if (this.injected || this.inFlight || !v || v.readyState < 2 || !v.videoWidth) return;
        if (this._lastVideoTime === v.currentTime && !v.requestVideoFrameCallback) return;
        this._lastVideoTime = v.currentTime;
        this.stats.frames++;
        const ts = performance.now();
        if (this.holisticFrame) {
            // a separate process: every camera picture, at most two on the way (one being
            // recognised there, the next one waiting), the game is never held up
            if ((this._hfOut || 0) >= 2 || ts - (this._holisticAt || 0) < 25) { this.stats.frames--; return; }
            this._holisticAt = ts;
            this._sendHandHelper(v, ts);
            this._hfOut = (this._hfOut || 0) + 1;
            this.lastSendStart = ts;
            try {
                const bitmap = await createImageBitmap(v);
                if (this.holisticFrame) this.holisticFrame.contentWindow.postMessage({ zns: 'frame', bitmap, ts }, this._frameOrigin, [bitmap]);
                else { bitmap.close?.(); this._hfOut = 0; }
            } catch (e) {
                this._hfOut = Math.max(0, (this._hfOut || 0) - 1);
            }
            // (a lost answer must not stop the camera for good)
            if (!this._hfWatch) this._hfWatch = setInterval(() => { if (this._hfOut && performance.now() - (this.lastSendEnd || 0) > 1500 && performance.now() - (this.lastSendStart || 0) > 1500) this._hfOut = 0; }, 1000);
        } else if (this.holistic) {
            // Holistic shares the game's thread: ~22 recognitions a second are plenty
            // (motion between them is blended), the rest of the time goes to the game.
            // (a heavy network on a slow frame rate: recognise less often — up to ~14 times a second —
            // so the game keeps its frames; set by the game through `gameFps`)
            const heavy = this.stats.avgCost > 14 && this.gameFps && this.gameFps < 40;
            const interval = heavy ? Math.min(72, HOLISTIC_INTERVAL + this.stats.avgCost) : HOLISTIC_INTERVAL;
            if (ts - (this._holisticAt || 0) < interval) { this.stats.frames--; return; }
            this._holisticAt = ts;
            this._sendHandHelper(v, ts);
            // One frame at a time, like the original camera loop
            this.inFlight = true;
            this.lastSendStart = performance.now();
            try {
                await this.holistic.send({ image: v });
                this.lastSendEnd = performance.now();
                const cost = performance.now() - ts;
                this.stats.avgCost = this.stats.avgCost ? this.stats.avgCost * 0.9 + cost * 0.1 : cost;
            } catch (e) {
                this._frameErrors = (this._frameErrors || 0) + 1;
                if (this._frameErrors < 5) console.warn('[PoseService] Holistic frame failed', e);
            }
            this.inFlight = false;
        } else if (this.worker) {
            this.inFlight = true;
            try {
                const bitmap = await createImageBitmap(v);
                this.worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
            } catch (e) {
                this.inFlight = false;
            }
        } else if (this.runner) {
            // (on the game's thread: up to ~30 a second; when the game is slow, less often)
            const slow = this.gameFps && this.gameFps < 50 && this.stats.avgCost > 15;
            if (ts - (this._holisticAt || 0) < (slow ? 50 : 30)) { this.stats.frames--; return; }
            this._holisticAt = ts;
            this.inFlight = true;
            this.lastSendStart = performance.now();
            try {
                const r = this.runner.detect(v, ts);
                this.lastSendEnd = performance.now();
                this._handleResult(r);
            } catch (e) {
                console.warn('[PoseService] detect failed', e);
            }
            this.inFlight = false;
        }
    }

    /** The hand helper gets the same frame (in parallel, its own thread) while a hand is lost. */
    _sendHandHelper(v, ts) {
        const wantHelper = performance.now() - (this._handMissingAt || 0) < 1500 && ts - (this._helperSentAt || 0) > 66;
        if (!this.handWorker || this.handInFlight || !wantHelper) return;
        this._helperSentAt = ts;
        this.handInFlight = true;
        createImageBitmap(v).then((bitmap) => {
            if (this.handWorker) this.handWorker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
            else { bitmap.close?.(); this.handInFlight = false; }
        }).catch(() => { this.handInFlight = false; });
    }

    /** Raw model output → guarded holistic-style results → poseData. */
    _handleResult(r) {
        if (this.recordSink) this.recordSink(r);
        this.stats.results++;
        this.stats.lastResultAt = performance.now();
        this.stats.avgCost = this.stats.avgCost * 0.9 + (r.cost || 0) * 0.1;
        const t = r.ts ?? performance.now();
        if (r.faceLandmarks !== undefined) this._lastFace = r.faceLandmarks;

        const pose = this.poseGuard.process(r.poseLandmarks, t);
        // (the wrists raw and filtered, picture by picture: a throw gives back the peak the filter cut off — ThrowModel.WristTrace;
        // its clock — the moment the picture reached the game, as the shown pose's)
        if (pose && r.poseLandmarks) {
            const tr = this.wristTrace || (this.wristTrace = { left: new WristTrace(), right: new WristTrace() }), now = performance.now();
            const L = r.poseLandmarks[15], R = r.poseLandmarks[16], fl = pose[15], fr = pose[16];
            if (L && fl) tr.left.push(now, L.x, L.y, fl.x, fl.y);
            if (R && fr) tr.right.push(now, R.x, R.y, fr.x, fr.y);
        }
        const assigned = assignHands(r.hands || [], pose || r.poseLandmarks);
        const results = {
            poseLandmarks: pose,
            faceLandmarks: this._lastFace,
            leftHandLandmarks: this.handGuards.left.process(assigned.left, t),
            rightHandLandmarks: this.handGuards.right.process(assigned.right, t),
        };
        results.at = performance.now(); // (CrossedArms: a picture not renewed for a while is no pose)
        this.lastResults = results;
        this._drawSkeleton(results);
        // (the picture's own time: PoseSmoother shows the arms and hands ahead of it, to the moment the frame is drawn)
        const pd = this.interpreter.process(results, this.native ? this._nativeVideo : this.videoElement);
        if (pd) pd.ts = t;
        if (this.onPoseUpdate) this.onPoseUpdate(this._withSticks(pd, r.sticks, assigned.left, assigned.right));
    }

    /** Feed already-detected results (tests, replays) through the same guards. */
    injectRaw(raw) {
        this.injected = true;
        this._handleResult(raw);
    }

    _drawSkeleton(results) {
        const c = this.skeletonCanvas || (this.skeletonCanvas = document.getElementById('skeleton-canvas'));
        if (!c) return;
        const box = c.parentElement;
        if (box && box.style.display === 'none') return; // preview hidden → don't spend time drawing
        const now = performance.now();
        if (now - this._lastDraw < 66) return; // ~15 FPS is plenty for a debug view
        this._lastDraw = now;
        const ctx = c.getContext('2d');
        const W = c.width, H = c.height;
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        const pl = results.poseLandmarks;
        if (pl) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            for (const [i, j] of POSE_LINKS) {
                ctx.beginPath();
                ctx.moveTo(pl[i].x * W, pl[i].y * H);
                ctx.lineTo(pl[j].x * W, pl[j].y * H);
                ctx.stroke();
            }
            ctx.fillStyle = '#ff0000';
            for (const idx of [0, 11, 12, 13, 14, 15, 16, 23, 24]) {
                ctx.beginPath();
                ctx.arc(pl[idx].x * W, pl[idx].y * H, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        for (const lm of [results.leftHandLandmarks, results.rightHandLandmarks]) {
            if (!lm) continue;
            ctx.strokeStyle = '#00ffff';
            ctx.fillStyle = '#00ffff';
            ctx.lineWidth = 2;
            for (const [i, j] of HAND_LINKS) {
                ctx.beginPath();
                ctx.moveTo(lm[i].x * W, lm[i].y * H);
                ctx.lineTo(lm[j].x * W, lm[j].y * H);
                ctx.stroke();
            }
            for (const p of lm) {
                ctx.beginPath();
                ctx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve();
        el.onerror = () => reject(new Error('cannot load ' + src));
        document.head.appendChild(el);
    });
}
