/**
 * DarkSkin.js — метки чёрной магии на теле (DarkMagic.js `darkLook`): тёмные пятна («зародыши проклятия»), растущие
 * по уровню прожилки, чернеющее тело, потемневшая одежда, трещины на доспехах и чёрный дымок от тела.
 *
 * Дёшево: НЕТ новой геометрии на уровень. Поверх частей тела (голова, торс, руки, ноги) кладутся копии мешей с ТОЙ ЖЕ
 * геометрией и одним общим материалом-маской: одна текстура (шум пятен + ячейки прожилок + трещины, сделана один раз),
 * а уровень — униформы шейдера. Материал на каждый шаг уровня (по 5) и вид части ('skin' | 'cloth' | 'armor') —
 * не больше 20 × 3, кэш ограничен самими шагами. Дым — один `Points` на существо (24 точки, общие материал и текстура),
 * только с уровня 10. Источников света нет — шейдеры не пересобираются.
 */

import * as THREE from 'three';
import { darkLook, DARK } from '../game/DarkMagic.js';

let _tex = null;
const _mats = new Map(); // 'skin:35' → material (≤ 3 × 21)
let _smokeMat = null;

/** Маска: R — порог пятен (равномерно 0…1, мягкие пятна), G — расстояние до жилок (ячейки), B — трещины (0 = трещина). */
function maskTexture() {
    if (_tex) return _tex;
    const N = 64, data = new Uint8Array(N * N * 4);
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    // мягкий шум пятен: сумма двух сеток значений, на тор
    const grid = (n) => Array.from({ length: n * n }, rnd);
    const g1 = grid(8), g2 = grid(16);
    const samp = (g, n, x, y) => {
        const fx = (x / N) * n, fy = (y / N) * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const sm = (t) => t * t * (3 - 2 * t);
        const at = (a, b) => g[((b % n + n) % n) * n + ((a % n + n) % n)];
        const a = at(ix, iy) * (1 - sm(tx)) + at(ix + 1, iy) * sm(tx), b = at(ix, iy + 1) * (1 - sm(tx)) + at(ix + 1, iy + 1) * sm(tx);
        return a * (1 - sm(ty)) + b * sm(ty);
    };
    const noise = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) noise[y * N + x] = samp(g1, 8, x, y) * 0.65 + samp(g2, 16, x, y) * 0.35;
    const order = [...noise.keys()].sort((a, b) => noise[a] - noise[b]); // (по рангу: доля площади = порог)
    const rank = new Float32Array(N * N);
    order.forEach((i, r) => { rank[i] = r / (N * N - 1); });
    // ячейки (жилки по границам) на тор
    const pts = Array.from({ length: 14 }, () => [rnd() * N, rnd() * N]);
    const wrap = (d) => Math.min(Math.abs(d), N - Math.abs(d));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let d1 = 1e9, d2 = 1e9;
        for (const [px, pz] of pts) { const d = Math.hypot(wrap(x - px), wrap(y - pz)); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        const i = (y * N + x) * 4;
        data[i] = Math.round(rank[y * N + x] * 255);
        data[i + 1] = Math.min(255, Math.round((d2 - d1) * 14)); // 0 на границе ячейки
        // трещины: тоже границы, но другого набора и тоньше (смещение сетки)
        data[i + 2] = Math.min(255, Math.round(Math.abs(Math.sin((x + y * 0.7 + noise[y * N + x] * 12) * 0.35)) * 255));
        data[i + 3] = 255;
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.needsUpdate = true;
    t.userData = { shared: true };
    return (_tex = t);
}

/** Общий материал-маска для вида части ('skin' | 'cloth' | 'armor' | 'magic' — магические доспехи слабее) и шага уровня. */
function overlayMat(kind, look, proj = false) {
    const key = (proj ? 'p' : '') + kind + ':' + look.step;
    let m = _mats.get(key);
    if (m) return m;
    m = new THREE.MeshLambertMaterial({ map: maskTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const U = {
        uSpots: { value: look.spots }, uVeins: { value: look.veins }, uBlack: { value: kind === 'skin' ? look.black : look.black * 0.9 },
        uCloth: { value: kind === 'cloth' ? look.cloth : 0 },
        uCrack: { value: kind === 'armor' ? look.crack : kind === 'magic' ? look.magicCrack : 0 },
    };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        // (модели жителей — слитые формы без UV: узор берётся по положению вершины, а не по развёртке)
        if (proj) sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', 'vUv = vec2(position.x + position.z * 0.7, position.y + position.z * 0.3) * 0.45;');
        sh.fragmentShader = sh.fragmentShader
            .replace('void main() {', 'uniform float uSpots, uVeins, uBlack, uCloth, uCrack;\nvoid main() {')
            .replace('#include <map_fragment>', `
                vec4 mk = texture2D(map, vUv);
                float spot = (1.0 - smoothstep(uSpots - 0.07, uSpots, mk.r)) * step(0.001, uSpots);
                float vein = (1.0 - smoothstep(0.0, 0.05 + uVeins * 0.28, mk.g)) * uVeins;
                float crack = (1.0 - smoothstep(0.0, 0.035 + uCrack * 0.05, mk.b)) * uCrack;
                float sp = spot * 0.8 * mix(0.25, 1.0, smoothstep(0.04, 0.3, uSpots));
                float a = max(max(sp, vein * 0.9), max(crack * 0.95, uCloth * 0.6));
                a = max(a, uBlack) * 0.97;
                vec3 tint = mix(vec3(0.16, 0.03, 0.2), vec3(0.01, 0.0, 0.015), clamp(uBlack + uCloth * 0.6 + vein * 0.5, 0.0, 1.0));
                diffuseColor = vec4(tint, a);
            `);
    };
    m.customProgramCacheKey = () => (proj ? 'darkskin-proj' : 'darkskin');
    m.userData.shared = true;
    _mats.set(key, m);
    return m;
}

function smokeMaterial() {
    if (_smokeMat) return _smokeMat;
    let map = null;
    if (typeof document !== 'undefined') {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(20,6,28,0.85)'); gr.addColorStop(0.5, 'rgba(10,3,16,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
        map = new THREE.CanvasTexture(c);
    }
    _smokeMat = new THREE.PointsMaterial({ map, size: 0.9, transparent: true, depthWrite: false, sizeAttenuation: true, opacity: 0.8 });
    return _smokeMat;
}

const SMOKE_N = 24;

/** Мешы тела, на которые кладётся маска: [mesh, kind]. */
function bodyTargets(ch) {
    const out = [];
    const add = (m, kind) => { if (m?.isMesh) out.push([m, kind]); };
    add(ch.head, 'skin');
    add(ch.body, 'cloth');
    for (const a of [ch.leftArmAnchor, ch.rightArmAnchor]) add(a?.children?.[0], 'cloth');
    for (const e of [ch.leftElbowAnchor, ch.rightElbowAnchor]) add(e?.children?.find((c) => c.isMesh), 'skin');
    for (const p of [ch.leftLegPivot, ch.rightLegPivot]) add(p?.children?.find((c) => c.isMesh), 'cloth');
    return out;
}

/**
 * Показать уровень тьмы `level` на теле `ch` (Character: head, body, плечи, предплечья, ноги + доспехи `_armorParts`).
 * Вызывать, когда уровень изменился (и после смены доспехов — `refreshArmor`).
 */
export function setDark(ch, level) {
    if (!ch?.group) return;
    const look = darkLook(level);
    if (ch._darkStep === look.step && ch._darkOverlays) return;
    ch._darkStep = look.step;
    clearOverlays(ch);
    if (look.step <= 0) { setSmoke(ch, look); return; }
    ch._darkOverlays = [];
    for (const [m, kind] of bodyTargets(ch)) addOverlay(ch, m, overlayMat(kind, look));
    refreshArmor(ch);
    setSmoke(ch, look);
}

/** Трещины на доспехах (после смены доспехов / при смене уровня). */
export function refreshArmor(ch) {
    if (!ch?._darkOverlays || ch._darkStep <= 0) return;
    const look = darkLook(ch._darkStep);
    for (const o of ch._darkArmor || []) o.parent?.remove(o);
    ch._darkArmor = [];
    if (look.crack <= 0) return;
    for (const p of ch._armorParts || []) p.traverse((m) => {
        if (!m.isMesh || m.userData?.darkOverlay) return;
        const o = new THREE.Mesh(m.geometry, overlayMat(m.userData?.magic || ch.look?.magicArmor ? 'magic' : 'armor', look));
        o.userData.darkOverlay = true;
        o.renderOrder = 1;
        o.layers.mask = m.layers.mask; // (в первом лице метки на спрятанной голове/шлеме тоже спрятаны)
        m.add(o);
        ch._darkArmor.push(o);
    });
}

function addOverlay(ch, m, mat) {
    const o = new THREE.Mesh(m.geometry, mat);
    o.userData.darkOverlay = true;
    o.renderOrder = 1;
    o.scale.setScalar(1.012); // (чуть шире, чтобы не мерцать на гранях)
    o.layers.mask = m.layers.mask; // (голова в первом лице на слое 1 — метки на ней тоже: иначе чёрные пятна перед глазами)
    m.add(o);
    ch._darkOverlays.push(o);
}

function clearOverlays(ch) {
    for (const o of ch._darkOverlays || []) o.parent?.remove(o);
    for (const o of ch._darkArmor || []) o.parent?.remove(o);
    ch._darkOverlays = null; ch._darkArmor = null;
}

function setSmoke(ch, look) {
    if (look.smoke <= 0) { if (ch._darkSmoke) ch._darkSmoke.visible = false; return; }
    if (!ch._darkSmoke) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE_N * 3), 3));
        const p = new THREE.Points(geo, smokeMaterial());
        p.frustumCulled = false; p.renderOrder = 2; p.name = 'dark-smoke';
        ch.group.add(p);
        ch._darkSmoke = p;
        ch._darkAge = new Float32Array(SMOKE_N).map((_, i) => i / SMOKE_N);
    }
    ch._darkSmoke.visible = true;
    ch._darkSmoke.layers.set(ch._fpv ? 1 : 0); // (свой дымок в первом лице не рисуется: 0,9-метровые клубы у самых глаз)
    ch._darkSmokeK = look.smoke;
}

/** Каждый кадр: дымок поднимается от тела (24 точки; число видимых — по уровню). */
export function tickDark(ch, dt) {
    const s = ch?._darkSmoke;
    if (!s || !s.visible) return;
    const want = ch._fpv ? 1 : 0;
    if (s.layers.mask !== (1 << want)) s.layers.set(want); // (переключили вид — дымок следом)
    const pos = s.geometry.attributes.position, age = ch._darkAge, k = ch._darkSmokeK || 0;
    const live = Math.max(2, Math.round(SMOKE_N * k));
    for (let i = 0; i < SMOKE_N; i++) {
        age[i] += dt * (0.35 + 0.1 * (i % 3));
        if (age[i] >= 1) age[i] -= 1;
        const a = age[i], ph = i * 2.399; // золотой угол — разные места по телу
        const on = i < live;
        pos.setXYZ(i, on ? Math.cos(ph) * (0.5 + a * 0.5) + Math.sin(a * 5 + i) * 0.12 : 0, on ? 0.5 - 1.5 + a * 3.4 : -999, on ? Math.sin(ph) * (0.35 + a * 0.4) : 0);
    }
    pos.needsUpdate = true;
}

/** Для `Game.prewarm`: по образцу маски и дыма (шейдеры собираются на загрузке, не в бою). */
export function darkSamples() {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    geo.userData.shared = true;
    g.add(new THREE.Mesh(geo, overlayMat('cloth', darkLook(60))));
    g.add(new THREE.Mesh(geo, overlayMat('cloth', darkLook(60), true)));
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE_N * 3), 3));
    const pts = new THREE.Points(pg, smokeMaterial());
    pts.frustumCulled = false;
    g.add(pts);
    return [g];
}

/** Метки на модели жителя / мага (VillagerModel: слитые части без UV — маска по положению). Уровень 0 снимает. */
export function setDarkVillager(model, level) {
    if (!model?._meshes) return;
    const look = darkLook(level);
    if (model._darkStep === look.step) return;
    model._darkStep = look.step;
    for (const o of model._darkOverlays || []) o.parent?.remove(o);
    model._darkOverlays = [];
    if (look.step <= 0) return;
    for (const m of model._meshes) {
        if (!m?.isMesh || m === model.tool || m.userData?.darkOverlay || !m.geometry) continue;
        const o = new THREE.Mesh(m.geometry, overlayMat(m === model.head?.children?.[0] ? 'skin' : 'cloth', look, true));
        o.userData.darkOverlay = true; o.renderOrder = 1; o.scale.setScalar(1.01);
        m.add(o);
        model._darkOverlays.push(o);
    }
}
