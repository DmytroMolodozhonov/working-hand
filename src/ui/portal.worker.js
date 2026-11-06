/**
 * portal.worker.js — the loading's whirlpool drawn in its own thread (the author 06.11: «загрузка прикольная, только подтормаживает
 * сильно»): the world is made in the page's thread (its tasks of tens of milliseconds, the shaders being compiled), and a whirl drawn
 * there stood still between them. Here, on an OffscreenCanvas handed over by PortalLoader, it turns at its own pace whatever the page
 * is busy with; the picture reaches the screen without the page's thread.
 *
 * Messages: init {canvas, w, h} · start {pal, dir, arms, seed} · prog {v} · arrive · size {w, h} · stop.
 * The clocks are this thread's own (the page's performance.now() is another clock): a message marks «now» here.
 */
import { VERT, FRAG, passageSpeed } from './PortalShader.js';

let gl = null, U = null, cv = null, soft = false;
let W = 2, H = 2, scale = 0.6;
let S = null; // the passage: { pal, dir, arms, seed, t0, tOut, prog, shown, tt, last }
let raf = 0, skip = 0;

const now = () => performance.now();
const nextFrame = (f) => (typeof self.requestAnimationFrame === 'function' ? self.requestAnimationFrame(f) : setTimeout(() => f(now()), 16));

function setup(canvas) {
    cv = canvas;
    gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: 'low-power', desynchronized: false, preserveDrawingBuffer: false });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    U = {};
    for (const n of ['uRes', 'uT', 'uOpen', 'uOut', 'uProg', 'uDir', 'uArms', 'uSeed', 'uC0', 'uC1', 'uC2', 'uC3']) U[n] = gl.getUniformLocation(pr, n);
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const ren = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    soft = /swiftshader|llvmpipe|software|basic render/i.test(ren);
    scale = soft ? 0.18 : 0.6;
    return true;
}

function frame(t) {
    raf = 0;
    if (!S || !gl) return;
    const dt = Math.min(0.1, (t - (S.last || t)) / 1000); S.last = t;
    const elapsed = (t - S.t0) / 1000;
    S.shown += (S.prog - S.shown) * Math.min(1, dt * 3.6);
    const open = Math.min(1, (t - S.t0) / 1400);
    const out = S.tOut ? Math.min(1, (t - S.tOut) / 1500) : 0;
    S.tt += dt * passageSpeed(elapsed, S.shown, out);
    skip = (skip + 1) % (soft ? 6 : 1); // (a software renderer: a picture every 6th frame — the processor makes the world)
    if (!skip) {
        // (a FIXED size while the passage runs: shrinking the canvas on a slow frame cleared and re-laid it — a visible tear, the author 06.11)
        const w = Math.max(2, Math.round(W * scale)), h = Math.max(2, Math.round(H * scale));
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
        const P = S.pal;
        gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uT, S.tt); gl.uniform1f(U.uOpen, open); gl.uniform1f(U.uOut, out);
        gl.uniform1f(U.uProg, S.shown); gl.uniform1f(U.uDir, S.dir); gl.uniform1f(U.uArms, S.arms); gl.uniform1f(U.uSeed, S.seed);
        gl.uniform3fv(U.uC0, P[0]); gl.uniform3fv(U.uC1, P[1]); gl.uniform3fv(U.uC2, P[2]); gl.uniform3fv(U.uC3, P[3]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (out >= 1 && t - S.tOut > 2600) { S = null; return; } // (the light has thinned: the page hides the canvas)
    raf = nextFrame(frame);
}

self.onmessage = (e) => {
    const m = e.data || {};
    try {
        if (m.type === 'init') { W = m.w; H = m.h; const ok = setup(m.canvas); self.postMessage({ type: 'ready', ok, soft }); return; }
        if (m.type === 'size') { W = m.w; H = m.h; return; }
        if (m.type === 'start') { S = { pal: m.pal, dir: m.dir, arms: m.arms, seed: m.seed, t0: now(), tOut: 0, prog: 0, shown: 0, tt: 0, last: 0 }; }
        else if (m.type === 'prog') { if (S) S.prog = Math.max(S.prog, m.v); }
        else if (m.type === 'arrive') { if (S) { S.prog = 1; S.tOut = now(); } }
        else if (m.type === 'stop') { S = null; }
        if (S && !raf) raf = nextFrame(frame);
    } catch (err) {
        self.postMessage({ type: 'ready', ok: false, why: String(err?.message || err) });
    }
};
