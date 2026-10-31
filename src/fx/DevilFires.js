/**
 * DevilFires.js — огонь вокруг Дьяволоса (просьба автора: «вокруг Дьяволоса везде горел ОГОНЬ… СВЕТИТ на него и окружение — чтобы он
 * красиво читался в красном свете, были видны рога, лицо, брюхо, цепь; особенно красиво внутри ямы — подсветка снизу»).
 *
 * Огненные чаши на столбах по кольцу котловины (кованая чаша на восьмигранном столбе из чёрного камня, угли, высокое живое пламя) —
 * 3 отрисовки на ВСЕ чаши (InstancedMesh: камень+железо, угли, пламя-билборд в шейдере), столбы с коллизией (addBox), искры вверх
 * из общего пула (только вблизи). Свет на нём — не лампы: шейдер его кожи (DiabolosModel.devilFireLight) — тёплый отсвет снизу
 * (лава ямы, угли) и сбоку (кольцо чаш), мерцает. Проход к нему с дороги прибытия — без чаш (`GAP`).
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

export const FIRES = {
    R: 82,          // м от середины котловины (внутри рва лавы: ров 96…110)
    N: 14,          // чаш по кругу (минус проход)
    GAP: 0.42,      // рад — по обе стороны от дороги прибытия чаш нет (проход 2×~34 м)
    K: 3,           // во сколько раз чаша больше человеческой (они — для бога ростом 122 м: рядом с ним чаша в 7 м — спичка)
    POST_H: 18,     // м — столб (в 5 раз выше героя; Дьяволосу — по колено)
    BOWL_R: 7.5,    // м — радиус чаши
    FLAME_W: 15, FLAME_H: 30,
    EMBER_R: 260,   // м — ближе этого из чаш летят искры
};

const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
function tint(geo, f) {
    const P = geo.getAttribute('position'), c = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const k = f(P.getX(i), P.getY(i), P.getZ(i), i); c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    return geo;
}
const STONE = (x, y, z, i) => { const k = 0.1 + 0.07 * hash(Math.floor(y * 2) * 13 + Math.floor(Math.atan2(z, x) * 3)); return [k * 1.15, k * 0.95, k * 0.9]; };
const IRON = (x, y, z) => { const k = 0.16 + 0.08 * hash(Math.floor(x * 3) * 7 + Math.floor(z * 3) * 11 + Math.floor(y * 4)); return [k * 1.1, k * 0.85, k * 0.7]; };

let _geo = null;
/** Формы (общие на игру): столб с чашей, угли, плоскость пламени. */
function geos() {
    if (_geo) return _geo;
    const H = FIRES.POST_H, R = FIRES.BOWL_R, K = FIRES.K;
    const parts = [
        { geo: tint(new THREE.CylinderGeometry(1.7 * K, 2.1 * K, 0.9 * K, 8), STONE), pos: [0, 0.45 * K, 0] },              // подножие
        { geo: tint(new THREE.CylinderGeometry(1.25 * K, 1.4 * K, 0.5 * K, 8), STONE), pos: [0, 1.15 * K, 0] },             // ступень
        { geo: tint(new THREE.CylinderGeometry(1.05 * K, 1.3 * K, H - 2.6 * K, 8), STONE), pos: [0, 1.4 * K + (H - 2.6 * K) / 2, 0] }, // столб
        { geo: tint(new THREE.CylinderGeometry(1.55 * K, 1.2 * K, 0.6 * K, 8), STONE), pos: [0, H - 1.2 * K + 0.3 * K, 0] }, // капитель
        { geo: tint(new THREE.CylinderGeometry(R, R * 0.55, 1.5 * K, 18, 1, true), IRON), pos: [0, H + 0.6 * K, 0] },       // чаша
        { geo: tint(new THREE.TorusGeometry(R, 0.22 * K, 6, 22), IRON), pos: [0, H + 1.35 * K, 0], rot: [Math.PI / 2, 0, 0] }, // обод
        { geo: tint(new THREE.TorusGeometry(1.2 * K, 0.12 * K, 5, 14), IRON), pos: [0, H * 0.55, 0], rot: [Math.PI / 2, 0, 0] }, // кованый пояс на столбе
    ];
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.4; parts.push({ geo: tint(new THREE.ConeGeometry(0.28 * K, 1.4 * K, 5), IRON), pos: [Math.cos(a) * R * 1.02, H + 1.9 * K, Math.sin(a) * R * 1.02] }); } // (кованые шипы на ободе)
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; parts.push({ geo: tint(new THREE.BoxGeometry(0.35 * K, 2.4 * K, 0.35 * K), IRON), pos: [Math.cos(a) * 1.5 * K, H - 0.3 * K, Math.sin(a) * 1.5 * K], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }); } // (лапы-подпорки)
    const body = mergeParts(parts);
    body.userData.keep = true;
    const coal = tint(new THREE.CircleGeometry(R * 0.92, 18), (x, y, z, i) => { const h = hash(i * 3.1); return [1, 0.35 + 0.35 * h, 0.06 * h]; });
    coal.rotateX(-Math.PI / 2); coal.translate(0, H + 1.05 * K, 0);
    coal.userData.keep = true;
    const flame = new THREE.PlaneGeometry(1, 1, 1, 1);
    flame.translate(0, 0.5, 0);
    flame.userData.keep = true;
    _geo = { body, coal, flame };
    return _geo;
}

let _mats = null;
const U = { uT: { value: 0 } };
function mats() {
    if (_mats) return _mats;
    const body = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    body.name = 'devil-fire-bowl';
    const coal = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    coal.name = 'devil-fire-coal';
    coal.onBeforeCompile = (sh) => {
        sh.uniforms.uT = U.uT;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT;')
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.75 + 0.35 * sin(uT * 3.0 + gl_FragCoord.x * 0.05) * sin(uT * 1.7 + gl_FragCoord.y * 0.07);');
    };
    coal.customProgramCacheKey = () => 'devil-fire-coal';
    // пламя: плоскость всегда лицом к камере (вокруг вертикали), языки — шумом, бегущим вверх; у каждой чаши своя фаза (по месту)
    const flame = new THREE.ShaderMaterial({
        uniforms: U,
        vertexShader: `uniform float uT; varying vec2 vUv; varying float vSeed;
void main() {
  vUv = uv;
  vec3 c = vec3(0.0);
  #ifdef USE_INSTANCING
  c = instanceMatrix[3].xyz;
  #endif
  vSeed = fract(sin(dot(c.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  float sw = ${FIRES.FLAME_W.toFixed(1)} * (0.9 + 0.2 * sin(uT * 5.0 + vSeed * 30.0));
  float sh = ${FIRES.FLAME_H.toFixed(1)} * (0.85 + 0.25 * sin(uT * 3.3 + vSeed * 17.0));
  vec3 p = c + vec3(0.0, ${(FIRES.POST_H + 1.0 * FIRES.K).toFixed(1)}, 0.0) + right * position.x * sw + vec3(0.0, position.y * sh, 0.0);
  p.x += sin(uT * 2.1 + vSeed * 9.0 + position.y * 2.0) * position.y * ${(0.7 * FIRES.K).toFixed(1)};
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,
        fragmentShader: `uniform float uT; varying vec2 vUv; varying float vSeed;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = vUv; float x = q.x - 0.5, y = q.y;
  float t = uT * 1.6 + vSeed * 10.0;
  float turb = n(vec2(q.x * 5.0, y * 4.0 - t * 2.2)) * 0.6 + n(vec2(q.x * 11.0, y * 9.0 - t * 3.5)) * 0.4;
  float w = (0.5 - y * 0.42) * (0.75 + 0.5 * turb);
  float body = smoothstep(w, w * 0.25, abs(x + (turb - 0.5) * 0.22 * y));
  body *= smoothstep(1.0, 0.45, y + turb * 0.35) * smoothstep(0.0, 0.06, y);
  float core = body * smoothstep(0.55, 0.0, y) * smoothstep(0.22, 0.0, abs(x));
  vec3 col = mix(vec3(0.85, 0.14, 0.02), vec3(1.0, 0.55, 0.08), body);
  col = mix(col, vec3(1.0, 0.93, 0.6), core);
  float a = clamp(body * 1.15, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    flame.name = 'devil-fire-flame';
    for (const m of [body, coal, flame]) m.userData.shared = true;
    _mats = { body, coal, flame };
    return _mats;
}

/** Места чаш: кольцо R вокруг середины котловины, проход в сторону дороги прибытия (dirYaw — угол на дорогу). */
export function firePlaces(cx, cz, roadAng) {
    const out = [];
    for (let i = 0; i < FIRES.N; i++) {
        const a = roadAng + (i + 0.5) / FIRES.N * Math.PI * 2;
        let d = a - roadAng; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < FIRES.GAP) continue;
        out.push({ x: cx + Math.cos(a) * FIRES.R, z: cz + Math.sin(a) * FIRES.R, a });
    }
    return out;
}

/** Огонь котловины: построить (y — пол), шаг кадра (искры, время), убрать. */
export class DevilFires {
    constructor(game) { this.game = game; this.group = null; this.boxes = []; this.places = []; this._emb = 0; }

    build(cx, cz, y, roadAng) {
        this.dispose();
        const g = this.game, G = geos(), M = mats();
        this.places = firePlaces(cx, cz, roadAng);
        const n = this.places.length;
        const grp = new THREE.Group(); grp.name = 'devil-fires';
        const body = new THREE.InstancedMesh(G.body, M.body, n), coal = new THREE.InstancedMesh(G.coal, M.coal, n), flame = new THREE.InstancedMesh(G.flame, M.flame, n);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
        this.places.forEach((f, i) => {
            q.setFromAxisAngle(_Y, -f.a + hash(i) * 0.6);
            m.compose(p.set(f.x, y, f.z), q, s);
            body.setMatrixAt(i, m); coal.setMatrixAt(i, m); flame.setMatrixAt(i, m);
            f.y = y;
            const hw = 1.5 * FIRES.K; // (столб с подножием; чаша над головой героя — сверху на неё можно сесть: коробка до обода)
            this.boxes.push(g.collision?.addBox?.({ minX: f.x - hw, maxX: f.x + hw, minY: y, maxY: y + FIRES.POST_H + 1.6 * FIRES.K, minZ: f.z - hw, maxZ: f.z + hw, kind: 'brazier' }));
        });
        body.castShadow = true; body.receiveShadow = true;
        flame.frustumCulled = false; flame.renderOrder = 2;
        grp.add(body, coal, flame);
        g.scene?.add(grp);
        this.group = grp;
    }

    update(dt, me) {
        if (!this.group) return;
        U.uT.value += dt;
        const fx = this.game.fx;
        if (!fx?.glow || !me) return;
        this._emb -= dt;
        if (this._emb > 0) return;
        this._emb = 0.12;
        for (const f of this.places) {
            if (Math.hypot(f.x - me.x, f.z - me.z) > FIRES.EMBER_R || Math.random() > 0.5) continue;
            fx.glow.spawn(f.x + (Math.random() - 0.5) * 9, f.y + FIRES.POST_H + 8, f.z + (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 4, 8 + Math.random() * 8, (Math.random() - 0.5) * 2, Math.random() < 0.7 ? 0xff7a1a : 0xffd27a, 0.5 + Math.random() * 0.6, 1.6 + Math.random(), { shrink: -0.6 });
        }
    }

    dispose() {
        const g = this.game;
        for (const id of this.boxes) if (id != null) g.collision?.removeBox?.(id);
        this.boxes.length = 0;
        if (this.group) { g.scene?.remove(this.group); for (const c of this.group.children) c.dispose?.(); this.group = null; }
    }

    /** Образцы для Game.prewarm (шейдеры чаш, углей, пламени). */
    static samples() { const G = geos(), M = mats(); return [new THREE.InstancedMesh(G.body, M.body, 1), new THREE.InstancedMesh(G.coal, M.coal, 1), new THREE.InstancedMesh(G.flame, M.flame, 1)]; }
}
const _Y = new THREE.Vector3(0, 1, 0);
