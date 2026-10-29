/**
 * GpuTexture.js — pictures made on the video card at loading (the author: «всё сложное — на видеокарту»).
 *
 * A picture that used to be worked out pixel by pixel on the processor (a loop over every pixel, or a 2D
 * canvas read back with getImageData — a stall: the card finishes all its work, the processor waits, then
 * the pixels go up to the card again) is drawn here by a fragment shader into a render target, once, on
 * the loading screen. The texture stays on the card: nothing is read back.
 *
 * The game's renderer is given once (main.js: setTextureRenderer). Without it (node tests, a worker, a
 * tool page), without WebGL2, or when the card fails a bake, the caller's processor path is used — the
 * reason goes to the journal (gpuTexLog: console + zns-perf.log).
 */
import * as THREE from 'three';

let _renderer = null;
const MARK = 'zns-bake-running'; // (set while the card bakes: a driver reset in the middle leaves it — the next start bakes on the processor)
const mark = (on) => { try { if (on) localStorage.setItem(MARK, String(Date.now())); else localStorage.removeItem(MARK); } catch (e) { /* no storage */ } };
let _why = 'нет рендерера'; // (why the card is not used: the journal says it once)
let _told = false;
let _baked = false; // (the first bake is told in the journal: where a driver reset happened shows)

/** The game's WebGL renderer (main.js, right after it is made). */
export function setTextureRenderer(renderer) {
    _renderer = null;
    try {
        let died = null;
        try { died = localStorage.getItem(MARK); } catch (e) { /* no storage */ }
        if (died) { mark(false); _why = 'прошлый запуск оборвался во время запекания (видеокарта сбросила графику) — запекаем на процессоре'; return; }
        if (!renderer?.capabilities?.isWebGL2) { _why = 'нет WebGL2'; return; }
        if (renderer.getContext().isContextLost()) { _why = 'контекст видеокарты потерян'; return; }
        _renderer = renderer;
        _why = '';
    } catch (e) { _why = 'ошибка: ' + (e?.message || e); }
}

/** A line about the pictures in the journal (and zns-perf.log, as the network's lines — Network.netLog). */
export function gpuTexLog(text) {
    const line = `${typeof Date !== 'undefined' ? new Date().toLocaleTimeString('ru-RU') : ''} 🎨 ${text}`;
    try { console.info(line); } catch (e) { /* ignore */ }
    if (typeof fetch === 'undefined' || typeof location === 'undefined' || !/^https?:/.test(location.protocol)) return;
    try { fetch('/api/perflog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line }) }).catch(() => {}); } catch (e) { /* ignore */ }
}

/** The renderer to bake with, or null (the processor's path: the reason told once). */
export function bakeRenderer(what) {
    if (_renderer && !_renderer.getContext().isContextLost()) return _renderer;
    if (_renderer) _why = 'контекст видеокарты потерян';
    if (!_told && typeof window !== 'undefined') { _told = true; gpuTexLog(`текстуры (${what}) — на процессоре: ${_why}`); }
    return null;
}

/** The card failed a bake: the processor's path from now on, the reason in the journal. */
export function bakeFailed(what, e) {
    _why = `${what}: ${e?.message || e}`;
    _renderer = null;
    gpuTexLog(`текстуры — на процессоре: ${_why}`);
}

const VERT = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

let _quad = null;
/** One pass: the shader over the whole target (a triangle covering it). */
function quad() {
    if (_quad) return _quad;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new THREE.Mesh(g, null);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    return (_quad = { mesh, scene, cam: new THREE.Camera() });
}

/** A render target of 8-bit RGBA (every card has it), read exactly (nearest) unless `final` sets otherwise. */
export function bakeTarget(w, h, opts = {}) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
        format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, ...opts,
    });
    rt.texture.userData = { keep: true };
    return rt;
}

const _mats = new Map(); // fragment shader → its material (a handful: the program is built once, not once a picture)
const _checked = new Set(); // (the materials whose program was looked at)

/** The material of a pass's shader (made once; the pass's uniform values put into it). */
function passMaterial(p) {
    let m = _mats.get(p.fragmentShader);
    if (!m) {
        const uniforms = {};
        for (const k in p.uniforms || {}) uniforms[k] = { value: null };
        m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: p.fragmentShader, uniforms, depthTest: false, depthWrite: false, glslVersion: THREE.GLSL3 });
        m.toneMapped = false;
        m.userData.keep = true;
        _mats.set(p.fragmentShader, m);
    }
    for (const k in p.uniforms || {}) m.uniforms[k].value = p.uniforms[k].value;
    m.uniformsNeedUpdate = true; // (the same material drawn twice in a row: its values are sent again only so)
    return m;
}

/**
 * Runs passes on the card: [{ target, fragmentShader, uniforms }] in order (a pass reads the earlier ones' targets
 * through its uniforms). The renderer's own state (target, clear, the shadow pass) is put back after. The pictures
 * a pass read are let go after (the caller frees them); the shaders stay built for the next picture of the kind —
 * `once`: a picture made once a game (the leaf atlas), its shaders freed after.
 */
export function runPasses(renderer, passes, { once = false } = {}) {
    const Q = quad();
    const was = { target: renderer.getRenderTarget(), auto: renderer.autoClear, xr: renderer.xr?.enabled, shadow: renderer.shadowMap.autoUpdate };
    renderer.autoClear = false;
    if (renderer.xr) renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    const used = new Set();
    const t0 = performance.now();
    if (!_baked) gpuTexLog(`запекание на видеокарте: старт (${passes.length} проходов)`);
    mark(true);
    try {
        for (const p of passes) {
            const m = passMaterial(p);
            used.add(m);
            Q.mesh.material = m;
            renderer.setRenderTarget(p.target);
            renderer.render(Q.scene, Q.cam);
            // (a shader the card would not build draws nothing: a black picture on the trees — the processor's path instead)
            if (_checked.has(m)) continue;
            const prog = renderer.properties.get(m).currentProgram;
            if (!prog || prog.diagnostics?.runnable === false) { mark(false); throw new Error('шейдер не собрался'); }
            if (!prog.diagnostics) { const gl = renderer.getContext(); if (!gl.getProgramParameter(prog.program, gl.LINK_STATUS)) { mark(false); throw new Error('шейдер не собрался'); } }
            _checked.add(m);
        }
        mark(false);
        if (!_baked) { _baked = true; gpuTexLog(`запекание на видеокарте: готово, ${Math.round(performance.now() - t0)} мс`); }
    } finally {
        renderer.setRenderTarget(was.target);
        renderer.autoClear = was.auto;
        if (renderer.xr) renderer.xr.enabled = was.xr;
        renderer.shadowMap.autoUpdate = was.shadow;
        Q.mesh.material = null;
        for (const m of used) for (const k in m.uniforms) if (m.uniforms[k].value?.isTexture) m.uniforms[k].value = null;
        if (once) for (const m of used) { _mats.delete(m.fragmentShader); _checked.delete(m); m.dispose(); }
    }
}
