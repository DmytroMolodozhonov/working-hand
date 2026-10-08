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

import { assignHands, HandStabilizer, PoseStabilizer } from './TrackingGuard.js';
import { PoseInterpreter } from './PoseInterpreter.js';

const POSE_LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const HAND_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]];

// Auto mode: above this many ms per camera frame on the CPU (< ~12 recognitions/s), use the graphics card
const AUTO_GPU_ABOVE_MS = 85;

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
        if (this.ready && quality === this._quality && (config.delegate === undefined || delegate === this._delegate)) return;
        this._quality = quality;
        if (config.delegate !== undefined) this._delegate = delegate;
        await this._startModels(quality);

        let width = 640, height = 480;
        if (config.resolution) {
            const [w, h] = String(config.resolution).split('x').map((n) => parseInt(n, 10));
            if (w && h) { width = w; height = h; }
        }
        this._resolution = { width, height };
        this.ready = true;
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

    _spawnWorker(quality, delegate) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./vision.worker.js', import.meta.url), { type: 'module' });
            const timeout = setTimeout(() => { worker.terminate(); reject(new Error('worker init timeout')); }, 60000);
            worker.onmessage = (ev) => {
                const msg = ev.data;
                if (msg.type === 'ready') {
                    clearTimeout(timeout);
                    this.stats.delegate = msg.delegate;
                    this.stats.avgCost = 0;
                    this.stats.results = 0;
                    worker.onmessage = (e) => { if (e.target === this.worker || this.worker === null) this._onWorkerMessage(e.data); };
                    resolve(worker);
                } else if (msg.type === 'error') {
                    clearTimeout(timeout);
                    worker.terminate();
                    reject(new Error(msg.message));
                }
            };
            worker.onerror = (e) => { clearTimeout(timeout); worker.terminate(); reject(new Error(e.message || 'worker error')); };
            worker.postMessage({ type: 'init', baseUrl: this.baseUrl, quality, delegate });
        });
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
        if (this.worker) { this.worker.postMessage({ type: 'close' }); this.worker.terminate(); this.worker = null; }
        if (this.runner) { this.runner.close(); this.runner = null; }
        this.inFlight = false;
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        if (!this.stream) {
            const { width, height } = this._resolution || { width: 640, height: 480 };
            this._status('Включение камеры...');
            this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' }, audio: false });
            this.videoElement.srcObject = this.stream;
            this.videoElement.muted = true;
            await this.videoElement.play().catch(() => {});
            if (this.previewElement) {
                // Reuse the same camera stream for the preview (the original opened the camera twice)
                this.previewElement.srcObject = this.stream;
                this.previewElement.play().catch(() => {});
            }
        }
        this._pump();
    }

    stop() {
        this.isRunning = false;
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
        const next = () => {
            if (!this.isRunning) return;
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
        if (this.worker) {
            this.inFlight = true;
            try {
                const bitmap = await createImageBitmap(v);
                this.worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
            } catch (e) {
                this.inFlight = false;
            }
        } else if (this.runner) {
            this.inFlight = true;
            try {
                this._handleResult(this.runner.detect(v, ts));
            } catch (e) {
                console.warn('[PoseService] detect failed', e);
            }
            this.inFlight = false;
        }
    }

    /** Raw model output → guarded holistic-style results → poseData. */
    _handleResult(r) {
        this.stats.results++;
        this.stats.lastResultAt = performance.now();
        this.stats.avgCost = this.stats.avgCost * 0.9 + (r.cost || 0) * 0.1;
        const t = r.ts ?? performance.now();
        if (r.faceLandmarks !== undefined) this._lastFace = r.faceLandmarks;

        const pose = this.poseGuard.process(r.poseLandmarks, t);
        const assigned = assignHands(r.hands || [], pose || r.poseLandmarks);
        const results = {
            poseLandmarks: pose,
            faceLandmarks: this._lastFace,
            leftHandLandmarks: this.handGuards.left.process(assigned.left, t),
            rightHandLandmarks: this.handGuards.right.process(assigned.right, t),
        };
        this.lastResults = results;
        this._drawSkeleton(results);
        if (this.onPoseUpdate) this.onPoseUpdate(this.interpreter.process(results, this.videoElement));
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
