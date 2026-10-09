/**
 * holistic.worker.js — the original MediaPipe Holistic network in its own
 * thread (a classic worker), so recognising the camera never stops the game:
 * the game draws on the main thread while this one looks at the camera.
 *
 * Holistic was written for a page: it loads its parts with <script> tags and
 * draws into a <canvas>. Here a tiny stand-in for those does the same with
 * importScripts() and an OffscreenCanvas (WebGL works in workers).
 *
 * Protocol:
 *   main -> worker  {type:'init', dir, quality}
 *   worker -> main  {type:'ready'} | {type:'error', message}
 *   main -> worker  {type:'frame', bitmap, ts}   (bitmap is transferred)
 *   worker -> main  {type:'result', ts, cost, poseLandmarks, faceLandmarks, leftHandLandmarks, rightHandLandmarks}
 */

/* global importScripts */
self.window = self;
self.alert = (m) => console.error('[holistic.worker]', m);
self.document = {
    createElement(tag) {
        if (tag === 'canvas') return new OffscreenCanvas(1, 1);
        if (tag === 'script') {
            const on = {};
            return {
                setAttribute(k, v) { this[k] = v; },
                addEventListener(type, fn) { (on[type] || (on[type] = [])).push(fn); },
                _fire(type) { for (const fn of on[type] || []) fn(); },
            };
        }
        throw new Error('holistic.worker: no <' + tag + '> here');
    },
    body: {
        appendChild(el) {
            try { importScripts(el.src); } catch (e) { console.error('[holistic.worker] cannot load', el.src, e); el._fire('error'); return; }
            el._fire('load');
        },
    },
    createEvent() { return { initCustomEvent() { } }; },
};

let holistic = null;
let pending = null; // {ts, t0} of the frame being recognised

let busy = false, next = null;
async function run(msg) {
    busy = true;
    try {
        pending = { ts: msg.ts, t0: performance.now() };
        await holistic.send({ image: msg.bitmap });
        if (pending) { pending = null; self.postMessage({ type: 'result', ts: msg.ts, cost: 0, empty: true }); } // (no answer for this frame)
    } catch (e) {
        self.postMessage({ type: 'error', message: String(e?.message || e), during: 'frame' });
    } finally {
        msg.bitmap?.close?.();
        busy = false;
    }
    if (next && holistic) { const n = next; next = null; await run(n); }
}

/** Only the plain landmark numbers travel back (nothing else can be copied to the page). */
const pts = (list) => (list ? list.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null);

self.onmessage = async (event) => {
    const msg = event.data;
    try {
        if (msg.type === 'init') {
            importScripts(msg.dir + 'holistic.js');
            holistic = new self.Holistic({ locateFile: (file) => msg.dir + file });
            holistic.setOptions({
                modelComplexity: Math.max(0, Math.min(2, msg.quality)),
                smoothLandmarks: true,
                enableSegmentation: false,
                smoothSegmentation: false,
                refineFaceLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });
            holistic.onResults((r) => {
                const p = pending || { ts: performance.now(), t0: performance.now() };
                pending = null;
                self.postMessage({
                    type: 'result', ts: p.ts, cost: performance.now() - p.t0,
                    poseLandmarks: pts(r.poseLandmarks), faceLandmarks: pts(r.faceLandmarks),
                    leftHandLandmarks: pts(r.leftHandLandmarks), rightHandLandmarks: pts(r.rightHandLandmarks),
                });
            });
            await holistic.initialize();
            self.postMessage({ type: 'ready' });
        } else if (msg.type === 'frame') {
            if (!holistic) { msg.bitmap?.close?.(); self.postMessage({ type: 'error', message: 'not ready', during: 'frame' }); return; }
            // the next camera frame waits here while one is being recognised (only the newest:
            // an older waiting one is dropped) — the network never sits idle between frames
            if (busy) {
                if (next) { next.bitmap?.close?.(); self.postMessage({ type: 'dropped' }); }
                next = msg;
                return;
            }
            await run(msg);
        } else if (msg.type === 'close') {
            try { holistic?.close(); } catch (e) { /* ignore */ }
            holistic = null;
        }
    } catch (e) {
        msg.bitmap?.close?.();
        self.postMessage({ type: 'error', message: String(e?.message || e), during: msg.type });
    }
};
