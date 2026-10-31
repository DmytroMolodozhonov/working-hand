/**
 * HellRealm.js — как ад ВЫГЛЯДИТ, ЗВУЧИТ и ЖЖЁТ там, где сейчас герой (план — HellMap.js, правила — HellRules.js).
 *
 *  - Небо: свой купол-шейдер (одна отрисовка, одна программа — образец в Game.prewarm): чёрный зенит, низкие тучи дыма, ползущие медленно, снизу
 *    подсвеченные заревом лавы; у горизонта багровое зарево, вдали — пульсирующие отсветы вулканов; ни солнца, ни луны, ни звёзд (обычное небо скрыто).
 *  - Свет и туман — World.setHell (общий свет мира: тёплый, приглушённый, снизу оранжевый — лава; ни одного нового источника света).
 *  - Лава течёт и светится в шейдере земли (VoxelShading HELL_TIME — одно число на весь мир).
 *  - Искры: пепел и угольки плывут вокруг героя, лавовые фонтаны кратеров и брызги у лавопадов — из общего пула искр (Effects.spark), с пределом на кадр.
 *  - Звук: горячий ветер и гул лавы (SoundManager.hellHum, синтезирован заранее).
 *  - Лава жжёт: стоишь в ней / на ней — LAVA.DPS урона в секунду и горение (герой ~3 с — «Вас сожгла лава»); упал ниже дна пропасти — смерть.
 *  - В аду вечные сумерки: день и ночь Земли не меняют свет (World.setHell).
 */
import * as THREE from 'three';
import { HELL, inHell } from '../world/HellMap.js';
import { LAVA, ABYSS_Y } from './HellRules.js';
import { HELL_TIME } from '../world/VoxelShading.js';
import { BLOCK } from '../world/Terrain.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const ASH = [0x6a6460, 0x4a4442, 0x8a8078], EMBER = [0xff5a14, 0xffa040, 0xff3010, 0xffd070];

const VERT = `varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;
const FRAG = `uniform float uT; uniform float uK;
varying vec3 vDir;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.0, w = 0.5; for (int i = 0; i < 4; i++) { a += w * n(p); p = p * 2.03 + 17.1; w *= 0.5; } return a; }
void main() {
    vec3 d = normalize(vDir);
    float up = clamp(d.y, -0.2, 1.0);
    vec2 p = d.xz / max(0.12, d.y + 0.25) * 1.6; // (the clouds' plane, low over the land)
    float c1 = fbm(p * 0.8 + vec2(uT * 0.012, uT * 0.007));
    float c2 = fbm(p * 2.2 - vec2(uT * 0.02, -uT * 0.011));
    float smoke = smoothstep(0.35, 0.85, c1 * 0.7 + c2 * 0.3);
    vec3 zen = vec3(0.025, 0.008, 0.006), hor = vec3(0.36, 0.07, 0.025);
    vec3 col = mix(hor, zen, smoothstep(0.0, 0.55, up));
    float glow = exp(-max(up, 0.0) * 5.0); // (the lava's glow from under the horizon)
    float az = atan(d.z, d.x);
    float volc = pow(max(0.0, sin(az * 3.0 + 1.3) * sin(az * 7.0 + uT * 0.05)), 6.0) * (0.6 + 0.4 * sin(uT * 0.8 + az * 5.0)); // (far volcanoes flaring)
    col += vec3(0.55, 0.13, 0.03) * glow * (0.7 + 0.5 * volc);
    vec3 lit = mix(vec3(0.06, 0.018, 0.012), vec3(0.42, 0.1, 0.03), glow * 0.8 + 0.25 * c2); // (the clouds' undersides lit red from below)
    col = mix(col, lit, smoke * 0.85);
    col += vec3(0.9, 0.3, 0.05) * smoothstep(0.92, 1.0, c2) * glow * 0.25; // (sparks of the fire in the smoke)
    if (d.y < 0.0) col = mix(col, vec3(0.2, 0.05, 0.02), smoothstep(0.0, -0.2, d.y));
    gl_FragColor = vec4(col, uK);
}`;

/** The material of hell's sky dome (one program; the tools draw with it too). */
export function hellSkyMaterial() {
    return new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uK: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, transparent: true });
}

export class HellRealm {
    constructor(game) {
        this.game = game;
        this.k = 0; // 0…1: how much of hell is round me (a short fade when I come and go)
        this.dome = null;
        this._burnT = 0;
        this._fxT = 0;
        this._hurtT = 0;
    }

    get data() { return this.game.terrain?.data || null; }

    _makeDome() {
        if (this.dome || !this.game.scene) return this.dome;
        const mat = hellSkyMaterial();
        mat.uniforms.uK.value = 0;
        const m = new THREE.Mesh(new THREE.SphereGeometry(440, 40, 20), mat);
        m.renderOrder = -9; m.frustumCulled = false; m.visible = false;
        this.game.scene.add(m);
        this.dome = m;
        return m;
    }

    /** (Game.prewarm) The dome's program compiled at loading. */
    sampleModels() { const d = this._makeDome(); return d ? [new THREE.Mesh(d.geometry, d.material)] : []; }

    update(dt) {
        const g = this.game, data = this.data, me = g.character?.group?.position;
        if (!me || !data?.hell) return;
        const want = inHell(me.x, me.z) ? 1 : 0;
        if (want !== this.k) this.k = want > this.k ? Math.min(1, this.k + dt * 1.5) : Math.max(0, this.k - dt * 1.5);
        const k = this.k;
        g.world?.setHell?.(k);
        g.sound?.hellHum?.(k * (g.hellGate?.trans ? 0.4 : 1));
        if (k <= 0) { if (this.dome) this.dome.visible = false; return; }
        HELL_TIME.t.value += dt;
        const dome = this._makeDome();
        if (dome) { dome.visible = true; dome.position.copy(me); dome.material.uniforms.uT.value = HELL_TIME.t.value; dome.material.uniforms.uK.value = k; }
        if (k < 1) return;
        this._sparks(dt, me);
        this._lava(dt, me);
    }

    /** Ash and embers round me; the fountains of the craters and the pools of the falls near me. */
    _sparks(dt, me) {
        const fx = this.game.fx;
        if (!fx) return;
        this._fxT -= dt;
        if (this._fxT > 0) return;
        this._fxT = 1 / 30;
        for (let i = 0; i < 2; i++) {
            const a = Math.random() * 6.283, r = 4 + Math.random() * 26;
            fx.spark(_v.set(me.x + Math.cos(a) * r, me.y + (Math.random() - 0.3) * 10, me.z + Math.sin(a) * r), ASH[i % 3], 0.07 + Math.random() * 0.06, _d.set((Math.random() - 0.5) * 0.6, -0.25 - Math.random() * 0.3, (Math.random() - 0.5) * 0.6), 3.5);
        }
        if (Math.random() < 0.6) { const a = Math.random() * 6.283, r = 6 + Math.random() * 20; fx.spark(_v.set(me.x + Math.cos(a) * r, me.y - 2 + Math.random() * 4, me.z + Math.sin(a) * r), EMBER[(Math.random() * 4) | 0], 0.08, _d.set((Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 0.8), 3); }
        const P = this.data.hellPlan;
        let budget = 30;
        for (const f of P.fountains) {
            const d = Math.hypot(f.x - me.x, f.z - me.z);
            if (d > 240 || budget <= 0) continue;
            const n = Math.min(budget, f.fall ? 4 : 8);
            budget -= n;
            for (let i = 0; i < n; i++) {
                const a = Math.random() * 6.283, s = f.fall ? 2.5 + Math.random() * 3 : 1.2 + Math.random() * 2.5, up = Math.sqrt(2 * 14 * f.h) * (0.6 + 0.4 * Math.random());
                fx.spark(_v.set(f.x + (Math.random() - 0.5) * 3, f.y + 0.6, f.z + (Math.random() - 0.5) * 3), EMBER[i % 4], 0.22 + Math.random() * 0.28, _d.set(Math.cos(a) * s, up, Math.sin(a) * s), 1.6 + Math.random());
            }
            if (!f.fall && Math.random() < 0.15) this.game.fx.lightFlash?.(_v.set(f.x, f.y + f.h * 0.5, f.z), 0xff6a1a, 2.5, 0.3, 60);
        }
    }

    /** Standing in / on lava burns (LAVA.DPS a second, and catching fire); under the abyss' floor — death. */
    _lava(dt, me) {
        const g = this.game, c = g.combat, data = this.data;
        if (!c || c.dead || g.isDeadLocal || g.creativeImmortal) return;
        const fy = me.y - PLAYER_GROUND_OFFSET * (g.character.size || 1);
        if (fy < ABYSS_Y - 4) { c.die?.(null, 'abyss'); return; }
        const ix = Math.round(me.x), iz = Math.round(me.z);
        const under = data.get(ix, Math.round(fy - LAVA.REACH), iz), at = data.get(ix, Math.round(fy + 0.3), iz);
        if (under !== BLOCK.HELL_LAVA && at !== BLOCK.HELL_LAVA) { this._burnT = 0; return; }
        if (g.flight?.active && fy - Math.floor(fy) > 0.8) return;
        this._burnT += dt;
        this._hurtT -= dt;
        if (this._hurtT > 0) return;
        this._hurtT = 0.25;
        if (!c.enabled) return; // (Creative without «Обычное здоровье»: the lava glows, it does not kill)
        g.burning?.ignite?.('p', g.localId, null, LAVA.BURN_S);
        if (c.hp - LAVA.DPS * 0.25 <= 0) c.die?.(null, 'lava');
        else c.damage?.(LAVA.DPS * 0.25, null, 'lava');
        for (let i = 0; i < 6; i++) g.fx?.spark(_v.set(me.x + (Math.random() - 0.5), fy + 0.2, me.z + (Math.random() - 0.5)), EMBER[i % 4], 0.2, _d.set((Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2), 0.8);
    }

    dispose() {
        if (this.dome) { this.game.scene?.remove(this.dome); this.dome.geometry.dispose(); this.dome.material.dispose(); this.dome = null; }
    }
}

export { HELL };
