/**
 * AutoTune.js — «Подобрать индивидуальные настройки» (автор 07.11): замер на самой видеокарте игрока, без игры.
 *
 * Своё окно WebGL (не то, в котором игра), в нём «сцена-образец» с той же ценой, что и настоящая: земля из множества кубиков (число треугольников — по
 * прорисовке мира, Quality.VIEW_DISTANCES × Quality.view уровня), солнечная тень (размер, мягкость и частота — как у уровня Quality.js), небо с облаками
 * на весь экран, у «Ультра» — густой газон (UltraGrass: 16 кусков × 8192 травинок) и вторая картинка (размытие на весь экран). Размер картинки — настоящий
 * (окно × множитель уровня). Кадры меряются без вертикальной синхронизации (чтение пикселя заставляет видеокарту закончить), берётся серединное время.
 *
 * Идём от самого красивого набора вниз (SystemSpecs.PRESETS) и останавливаемся на первом, что укладывается в бюджет (SystemSpecs.TUNE.BUDGET_MS = 4 мс —
 * запас больше чем вдвое на небо, существ, руки и логику игры). Пробный кадр сначала решает, с какого набора начинать: слабая видеокарта не мучается тяжёлыми.
 * «А если»: нет видеокарты (программная отрисовка) — не меряем, берём самый лёгкий; окно закрыто / отмена — всё освобождается; потеря контекста — честный
 * отказ; кадр дольше 400 мс — набор сразу «не подходит»; игра уже идёт — окно подбора доступно только в меню (кнопка в «Механике»).
 */

import * as THREE from 'three';
import { QUALITY_LEVELS, ULTRA_LEVEL, VIEW_DISTANCES } from '../game/Quality.js';
import { PRESETS, TUNE, pickPreset, presetFloor, isSoftwareGpu } from '../game/SystemSpecs.js';

const KEY = 'zns-tune';
const BASE_TRIS = 190000; // «низкая» прорисовка: треугольников (средняя — ×2,56 ≈ 486 тыс.: потолок creativebench)
const FRAMES = 20; // замеряемых кадров набора
const WARM = 4;
const FRAME_STOP_MS = 400;

const hardLevel = (p) => (p.graphics === 'ultra' ? ULTRA_LEVEL : QUALITY_LEVELS[Number(p.graphics)]);
const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });

/** Запомненный прошлый результат (или null). */
export function lastTune() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
}
export function rememberTune(t) {
    try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) { /* private mode */ }
}

function noiseTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = 90 + ((x * 73856093) ^ (y * 19349663)) % 90; g.fillStyle = `rgb(${v},${v + 30},${v - 20})`; g.fillRect(x, y, 1, 1); }
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40);
    return t;
}

const CLOUD_FS = `
varying vec2 vUv; uniform float uT;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
void main(){ vec2 p = vUv * 6.0 + vec2(uT * 0.02, 0.0); float a = 0.0, s = 0.5; for (int i = 0; i < 5; i++) { a += s * n(p); p *= 2.02; s *= 0.5; } gl_FragColor = vec4(vec3(0.8 + a * 0.2), a * 0.5); }`;
const POST_FS = `
varying vec2 vUv; uniform sampler2D tex; uniform vec2 px;
void main(){ vec4 c = vec4(0.0); for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) c += texture2D(tex, vUv + vec2(float(x), float(y)) * px * 1.5); c /= 9.0; float v = smoothstep(1.0, 0.3, length(vUv - 0.5) * 1.4); gl_FragColor = vec4(c.rgb * (0.8 + 0.2 * v), 1.0); }`;
const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const GRASS_VS = `
uniform float uT; varying float vH;
void main(){ vH = position.y; vec4 w = instanceMatrix * vec4(position.x * 0.04, position.y * 0.7, 0.0, 1.0); w.x += sin(uT * 2.0 + w.z * 0.7) * position.y * position.y * 0.15; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GRASS_FS = 'varying float vH; void main(){ gl_FragColor = vec4(mix(vec3(0.1, 0.3, 0.05), vec3(0.45, 0.75, 0.2), vH), 1.0); }';

/** Сцена-образец одного набора. → { render(t), dispose() } */
function buildProxy(renderer, p, W, H) {
    const q = hardLevel(p);
    const scale = VIEW_DISTANCES[p.view].scale * q.view;
    const tris = Math.round(BASE_TRIS * scale * scale);
    const cubes = Math.round(tris / 12);
    const R = 90 * scale;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87b8e8);
    scene.fog = new THREE.Fog(0x9cc4e8, 10, R);
    const cam = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000);
    cam.position.set(0, 12, 0);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(40, 90, 30);
    scene.add(sun, sun.target, new THREE.AmbientLight(0xaabbcc, 0.55));
    const tex = noiseTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.2, R * 2.2).rotateX(-Math.PI / 2), mat);
    ground.receiveShadow = true;
    scene.add(ground);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const near = Math.min(Math.round(cubes * 0.6), Math.round(q.shadowFly * q.shadowFly * 1.5));
    const mk = (count, rad, cast) => {
        const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
        const a = m.instanceMatrix.array;
        const side = Math.ceil(Math.sqrt(count)), step = (rad * 2) / side;
        for (let i = 0; i < count; i++) {
            const o = i * 16;
            a[o] = 1; a[o + 5] = 1; a[o + 10] = 1; a[o + 15] = 1;
            a[o + 12] = -rad + (i % side) * step + (((i * 7919) % 13) / 13) * step;
            a[o + 13] = 0.5 + (((i * 104729) % 5) / 5) * 1.5;
            a[o + 14] = -rad + Math.floor(i / side) * step + (((i * 1299709) % 11) / 11) * step;
        }
        m.instanceMatrix.needsUpdate = true;
        m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false;
        scene.add(m);
        return m;
    };
    mk(cubes - near, R, false);
    mk(near, q.shadowFly, true);
    sun.castShadow = q.shadows;
    if (q.shadows) {
        sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
        const c = sun.shadow.camera; c.left = c.bottom = -q.shadowFly; c.right = c.top = q.shadowFly; c.near = 1; c.far = 300; c.updateProjectionMatrix();
    }
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = q.shadowEvery === 1;
    const extra = [];
    const quad = (fs, uniforms, transparent) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms, transparent, depthTest: false, depthWrite: false }));
        m.frustumCulled = false; m.renderOrder = 10; extra.push(m); return m;
    };
    let clouds = null;
    if (q.clouds) { clouds = quad(CLOUD_FS, { uT: { value: 0 } }, true); scene.add(clouds); }
    let grass = null, rt = null, post = null, postScene = null;
    if (p.graphics === 'ultra') {
        const SEG = 4, pos = [], idx = [];
        for (let s = 0; s <= SEG; s++) pos.push(-1, s / SEG, 0, 1, s / SEG, 0);
        for (let s = 0; s < SEG; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(idx);
        const blades = 16 * 8192;
        grass = new THREE.InstancedMesh(bg, new THREE.ShaderMaterial({ vertexShader: GRASS_VS, fragmentShader: GRASS_FS, uniforms: { uT: { value: 0 } }, side: THREE.DoubleSide }), blades);
        const a = grass.instanceMatrix.array;
        for (let i = 0; i < blades; i++) {
            const o = i * 16, ang = (i * 2.399963) % (Math.PI * 2), r = 2 + Math.sqrt((i % 20011) / 20011) * 28;
            a[o] = 1; a[o + 5] = 1; a[o + 10] = 1; a[o + 15] = 1;
            a[o + 12] = Math.cos(ang) * r; a[o + 13] = 0; a[o + 14] = Math.sin(ang) * r;
        }
        grass.instanceMatrix.needsUpdate = true; grass.frustumCulled = false;
        scene.add(grass);
        const w = renderer.domElement.width, h = renderer.domElement.height;
        rt = new THREE.WebGLRenderTarget(w, h);
        postScene = new THREE.Scene();
        post = quad(POST_FS, { tex: { value: rt.texture }, px: { value: new THREE.Vector2(1 / w, 1 / h) } }, false);
        postScene.add(post);
    }
    const postCam = new THREE.Camera();
    let frame = 0;
    return {
        tris,
        render(t) {
            cam.rotation.y = Math.sin(t * 0.5) * 0.8; cam.rotation.x = -0.25;
            if (clouds) clouds.material.uniforms.uT.value = t;
            if (grass) grass.material.uniforms.uT.value = t;
            if (q.shadows && q.shadowEvery > 1) renderer.shadowMap.needsUpdate = (frame % q.shadowEvery) === 0;
            frame++;
            if (rt) { renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(postScene, postCam); } else renderer.render(scene, cam);
        },
        dispose() {
            for (const o of [...scene.children, ...postScene?.children || []]) { o.geometry?.dispose?.(); if (o.material && o.material !== mat) o.material.dispose?.(); }
            geo.dispose(); mat.dispose(); tex.dispose(); rt?.dispose();
        },
    };
}

/**
 * Замер. opts: { hw, onProgress(text, share), signal }. → { ok, ms: {id: мс}, pick: {preset, ms, headroom, reason}, why? }
 * Не бросает: любая беда — { ok: false, why }.
 */
export async function runTune({ hw = {}, onProgress = () => {}, signal = null, all = false } = {}) {
    if (!all && isSoftwareGpu(hw.gpuName)) {
        const pick = pickPreset({}, { ...hw, weakGpu: true });
        return { ok: true, ms: {}, pick, why: 'software' };
    }
    let renderer = null;
    const ms = {};
    try {
        const canvas = document.createElement('canvas');
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
        let lost = false;
        canvas.addEventListener('webglcontextlost', () => { lost = true; });
        const gl = renderer.getContext();
        const dpr = window.devicePixelRatio || 1;
        const px = new Uint8Array(4);
        const measure = async (p) => {
            const q = hardLevel(p);
            const ratio = Math.min(dpr, q.pixelRatio);
            let W = Math.round(window.innerWidth * ratio), H = Math.round(window.innerHeight * ratio);
            const k = Math.min(1, 3840 / W, 2160 / H); W = Math.round(W * k); H = Math.round(H * k);
            renderer.setPixelRatio(1); renderer.setSize(W, H, false);
            const proxy = buildProxy(renderer, p, W, H);
            const times = [];
            try {
                for (let i = 0; i < WARM + FRAMES; i++) {
                    if (signal?.aborted || lost) return null;
                    const t0 = performance.now();
                    proxy.render(t0 / 1000);
                    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // (the card has finished the frame)
                    const dt = performance.now() - t0;
                    if (i >= WARM) times.push(dt);
                    if (dt > FRAME_STOP_MS) return Infinity;
                    if (!all && i === WARM + 6 && times.length >= 6 && times.slice().sort((a, b) => a - b)[3] > TUNE.BUDGET_MS * 5) return times.slice().sort((a, b) => a - b)[3]; // (hopeless: no need to go on)
                    await tick();
                }
            } finally { proxy.dispose(); }
            times.sort((a, b) => a - b);
            return times[times.length >> 1];
        };
        const first = presetFloor(hw);
        let list = PRESETS.slice(first);
        // the probe: a middle set tells where to start
        const probeP = PRESETS.find((p) => p.id === 'high-medium');
        onProgress('Пробный кадр…', 0.05);
        const tp = await measure(probeP);
        if (tp == null) return { ok: false, why: lost ? 'Видеокарта сбросила окно замера.' : 'Отменено.' };
        ms[probeP.id] = tp;
        if (all) list = PRESETS.slice();
        else if (tp > TUNE.BUDGET_MS * 6) list = list.filter((p) => PRESETS.indexOf(p) >= PRESETS.findIndex((x) => x.id === 'mid-low'));
        else if (tp > TUNE.BUDGET_MS * 2) list = list.filter((p) => PRESETS.indexOf(p) >= PRESETS.indexOf(probeP));
        let n = 0;
        for (const p of list) {
            if (ms[p.id] === undefined) {
                onProgress(`Проверяю: ${p.name}`, 0.1 + 0.85 * (n / Math.max(1, list.length)));
                const t = await measure(p);
                if (t == null) return { ok: false, why: lost ? 'Видеокарта сбросила окно замера.' : 'Отменено.' };
                ms[p.id] = t;
            }
            n++;
            if (!all && ms[p.id] <= TUNE.BUDGET_MS) break; // (the most beautiful that fits: nothing more to try)
        }
        const pick = pickPreset(ms, hw);
        onProgress('Готово', 1);
        return { ok: true, ms, pick };
    } catch (e) {
        return { ok: false, why: 'Замер не удался: ' + (e?.message || e) };
    } finally {
        try { renderer?.dispose(); renderer?.forceContextLoss(); } catch (e) { /* gone */ }
    }
}
