/**
 * Godhood.js — who killed all seven titans (Titans.js) becomes a god (the author 06.11): immortal, +10 000 mana cells
 * (Achievements 'godhood'), and the Sun no longer burns him — it takes him into its Hall (SunHallPlan.js).
 *
 *  - THE ASCENSION (`ascend`, ~10 s — a change of the body: CLAUDE.md «Превращения — не мгновенные, магические и через боль»): a pillar of
 *    the Sun's light comes down on the hero, gold sparks spiral up round him, he is lifted off the ground; the pain comes in waves (gold at
 *    the edges of the eyes, −HP never below 1, the picture swims, the heart beats); then the burst — a flash, a ring of light over the
 *    ground — and he is set down a god, a faint gold glow about him ever after.
 *  - «ПОЧТИ СТАЛ БОГОМ» (Creative, «Где появиться» — `almost`): the hero comes with no magic at all; about ten seconds later the gods'
 *    power is given to him (the ascension) — to see it and to fly to the Sun («Флайн», «Flying Maxima» up).
 *  - THE HALL OF THE SUN (`enterHall` — Space calls it when a god nears the Sun): he is out of space and in a round golden hall high in the
 *    Earth's sky (built of blocks the first time, a slice a frame, as «Логово зельевара»): the golden book of the gods' story on a stand,
 *    the pentagram of renewal (stand in its circle MORTAL_T s — mortal again: no immortality, the 10 000 cells taken back; the titans
 *    stay dead), the arch home (stand in it — back on the Earth, at the start).
 *  - IMMORTAL (`immortal`): Combat.die asks — a blow that would kill leaves him with a quarter of his health (`saved`).
 *
 * What may go wrong (handled): the hero dies or leaves in the middle of the ascension — it ends (no half-god: nothing given until its
 * end); the land of the hall not there yet — he waits in the air over it (≤ 40 s, then back to the start with the reason); the hall
 * built already (a second visit) — its marker found, not built again; a save in the middle — the state is {god, renounced} only (the
 * ascension is not saved half-done: a god after loading is a god); Creative — achievements are off there: the cells added by hand.
 */
import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { SUN_HALL, sunHallPlan, sunHallBookSpot } from '../world/SunHallPlan.js';
import { allTitansDead, TITAN, TITAN_IDS } from './TitanRules.js';
import { changeHurt, painRed, changeDizzy } from './TransformPain.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

export const GOD = {
    ASCEND_T: 10, // s the ascension lasts
    ALMOST_WAIT: 10, // s with no magic before the power comes («Почти стал богом»)
    LIFT: 4, // m he is lifted
    PAIN: [3.5, 5.5, 7], // s when it hurts (−1 HP each)
    WAIT_MAX: 40, // s to wait for the hall's land
    HOVER: 10, // m over the hall's floor while it is built
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Godhood {
    constructor(game) {
        this.game = game;
        this.state = { god: false, renounced: false };
        this.cer = null; // the ascension in progress {t, base, pillar, ring, test}
        this.almostT = 0; // «Почти стал богом»: s left without magic
        this.hall = null; // {phase: 'wait'|'build'|'place', t, i, plan}
        this.inHall = false;
        this.pentT = 0; this.exitT = 0;
        this._glowT = 0;
    }

    get god() { return this.state.god; }
    get immortal() { return this.state.god; }
    /** No magic: before the power comes («Почти стал богом») and while it comes. */
    get noMagic() { return this.almostT > 0 || !!this.cer; }
    get data() { return this.game.world?.terrain?.data || null; }

    // ------------------------------------------------------------------ becoming a god
    /** A titan fell (Titans._dies / its message): all seven dead and I fought them — the ascension. */
    titanDied() {
        const g = this.game;
        if (this.state.god || this.state.renounced || this.cer) return;
        const dead = g.titans?.state?.dead || [];
        if (dead.length >= TITAN_IDS.length - 1) this.warm(); // (the last one left: the pillar's shader readied now, not at the ascension)
        if (!allTitansDead(dead)) return;
        // (the one who fought them: has every titan's achievement — in Creative achievements are off: there, the one present)
        const ach = g.achievements;
        const mine = g.config?.mode === 'creative' || !ach?.done || TITAN_IDS.every((id) => ach.done.has('titan_' + id));
        if (!mine) return;
        this.ascend();
    }

    /** «Почти стал богом»: no magic now; the power comes in a few seconds. */
    almost() {
        const g = this.game;
        this.almostT = GOD.ALMOST_WAIT;
        this.warm();
        this.state.renounced = false;
        g.hud?.toast?.('☀️ Вы почти бог. Магии у вас пока нет совсем — подождите: сила богов вот-вот придёт');
    }

    /** The pillar's shaders compiled ahead (an idle moment), never in the ascension's first frame (CLAUDE.md «Шейдеры только на загрузке»). */
    warm() {
        const g = this.game;
        if (this._warm || !g.renderer?.compile || !g.camera) return;
        this._warm = true;
        const run = () => { try { const c0 = this.cer; this.cer = {}; this._pillar(); const sc = new THREE.Scene(), c = this.cer; g.scene.remove(c.pillar); g.scene.remove(c.ring); sc.add(c.pillar, c.ring); g.renderer.compile(sc, g.camera); c.geo.dispose(); c.core.material.dispose(); c.veil.material.dispose(); c.ring.geometry.dispose(); c.ring.material.dispose(); this.cer = c0; } catch (e) { console.warn('godhood warm', e); } };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 0);
    }

    ascend(test = false) {
        const g = this.game;
        if (this.cer || this.state.god) return;
        const me = g.character?.group?.position;
        if (!me) return;
        this.cer = { t: 0, base: me.clone(), pillar: null, ring: null, hurt: 0, test };
        g.wandMagic?._nox?.(false);
        g.sound?.playTitan?.(me, 'charge', 1.4);
        g.sound?.playTitan?.(me, 'rise', 1.2);
        g.hud?.setVoice?.('☀️ С неба опускается свет Солнца…', true);
        this._pillar();
    }

    /**
     * The pillar of the Sun's light: two open cylinders (a white core, a wide gold veil) of one soft shader — bright where seen
     * face-on, fading to the edges and towards the top, bands of light running down it; and the ring of the burst.
     */
    _pillar() {
        const g = this.game, c = this.cer;
        const mk = (col, w) => new THREE.ShaderMaterial({
            uniforms: { uT: { value: 0 }, uK: { value: 0 }, uC: { value: new THREE.Color(col) }, uW: { value: w } },
            vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
            fragmentShader: 'uniform float uT; uniform float uK; uniform vec3 uC; uniform float uW; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float face = pow(abs(dot(vN, vV)), uW); float top = smoothstep(1.0, 0.55, vUv.y) * smoothstep(0.0, 0.02, vUv.y); float bands = 0.7 + 0.3 * sin(vUv.y * 140.0 + uT * 14.0) * sin(vUv.y * 37.0 + uT * 5.0); gl_FragColor = vec4(uC * (0.8 + 0.4 * face), face * top * bands * uK); }',
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        });
        const geo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
        const core = new THREE.Mesh(geo, mk(0xfffbe8, 3)), veil = new THREE.Mesh(geo, mk(0xffc84a, 1.5));
        core.scale.set(1.3, 400, 1.3); veil.scale.set(4, 400, 4);
        const P = new THREE.Group(); P.add(core, veil);
        g.scene.add(P);
        c.pillar = P; c.core = core; c.veil = veil; c.geo = geo;
        const rm = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), rm);
        ring.rotation.x = -Math.PI / 2;
        g.scene.add(ring);
        c.ring = ring;
    }

    _stepAscend(dt) {
        const g = this.game, c = this.cer, T = GOD.ASCEND_T;
        const me = g.character.group.position;
        if (g.isDeadLocal || g.combat?.dead) { this._endAscend(false); return; }
        c.t += dt;
        const t = c.t;
        // the hero lifted in the light (held: no walking off), set down at the end
        const lift = t < 7 ? GOD.LIFT * Math.min(1, t / 3.5) : GOD.LIFT * Math.max(0, 1 - (t - 7.5) / 2);
        me.set(c.base.x, c.base.y + lift, c.base.z);
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
        // the pillar of light: coming down, brightening, gone after the burst
        const P = c.pillar, k = t < 2.5 ? t / 2.5 : t < 7.2 ? 1 : Math.max(0, 1 - (t - 7.2) / 1.2);
        P.position.set(c.base.x, c.base.y + 200 * (1 + (1 - Math.min(1, t / 2.5)) * 2), c.base.z); // (it comes down from the sky)
        for (const m of [c.core, c.veil]) { m.material.uniforms.uT.value = t; m.material.uniforms.uK.value = k * (m === c.core ? 1.1 : 0.55); }
        c.veil.scale.x = c.veil.scale.z = 4 + Math.max(0, t - 5) * 1.2; // (it widens before the burst)
        // gold sparks spiralling up round him, more and faster as it goes
        const fx = g.fx;
        if (fx?.spark && t < 7.3) {
            const n = Math.round(4 + t * 2);
            for (let i = 0; i < n; i++) {
                const a = t * 4 + i * 2.39, r = 3 - Math.min(2.2, t * 0.3);
                _v.set(c.base.x + Math.cos(a) * r, c.base.y + Math.random() * (2 + lift * 1.2), c.base.z + Math.sin(a) * r);
                _w.set(-Math.sin(a) * 3, 2 + Math.random() * 3, Math.cos(a) * 3);
                fx.spark(_v, i % 3 ? 0xffd36a : 0xfff6d0, 0.35, _w, 0.8 + Math.random() * 0.5);
            }
        }
        // the pain: gold at the edges of the eyes in waves, the picture swimming, the heart beating
        const pain = t > 2.5 && t < 7.4 ? (0.5 + 0.5 * Math.sin(t * 3.4) ** 2) * Math.min(1, (t - 2.5) / 1.5) : -1;
        painRed(pain, '255,190,40');
        if (t > 3 && t < 7.2) { changeDizzy(g, 0.35); c.beatT = (c.beatT || 0) - dt; if (c.beatT <= 0) { c.beatT = 0.9 - (t - 3) * 0.1; g.cameraShake?.(0.12, 0.2); } }
        while (c.hurt < GOD.PAIN.length && t >= GOD.PAIN[c.hurt]) { c.hurt++; changeHurt(g, 1, 'godhood'); if (c.hurt === 1) g.hud?.setVoice?.('☀️ Сила богов входит в вас — это больно…', true); }
        // the burst
        if (t >= 7.2 && !c.burst) {
            c.burst = true;
            g.hud?.flash?.('#fff3c0', 1, 1600);
            g.fx?.lightFlash?.(me.clone(), 0xfff0b0, 30, 1.2, 300);
            g.sound?.playTitan?.(me, 'clap', 1.6);
            g.sound?.playTitan?.(me, 'death', 0.5);
            g.cameraShake?.(0.6, 1.4);
        }
        if (c.burst) {
            const r = (t - 7.2) * 45;
            c.ring.position.set(c.base.x, c.base.y + 0.3, c.base.z);
            c.ring.scale.setScalar(Math.max(0.1, r));
            c.ring.material.opacity = Math.max(0, 0.8 * (1 - (t - 7.2) / 2.2));
        }
        if (t >= T) this._endAscend(true);
    }

    _endAscend(done) {
        const g = this.game, c = this.cer;
        this.cer = null;
        painRed(-1);
        if (c) {
            if (c.pillar) { g.scene.remove(c.pillar); c.geo.dispose(); c.core.material.dispose(); c.veil.material.dispose(); }
            if (c.ring) { g.scene.remove(c.ring); c.ring.geometry.dispose(); c.ring.material.dispose(); }
        }
        if (!done) return;
        this.state.god = true;
        this.state.renounced = false;
        // +10 000 cells: the achievement (Creative has none — there the cells are added by hand, once)
        const got = g.achievements?.gain?.('godhood');
        if (!got && !this.state.cells && g.combat) { g.combat.addMaxFatigue ? g.combat.addMaxFatigue(TITAN.GOD_CELLS) : (g.combat.maxFatigue = (g.combat.maxFatigue || 30) + TITAN.GOD_CELLS); g.combat._hudKey = ''; this.state.cells = TITAN.GOD_CELLS; }
        if (g.combat) { g.combat.hp = g.combat.maxHp || g.combat.hp; g.combat.fatigue = g.combat.maxFatigue; g.combat._hudKey = ''; }
        g.hud?.toast?.('☀️ Вы стали богом: вы бессмертны, и у вас на 10 000 ячеек маны больше. Солнце больше не обжигает вас — летите к нему («Флайн», затем «Flying Maxima» вверх)');
    }

    /** I would have died — immortal: left with a quarter of the health (Combat.die). */
    saved() {
        const g = this.game, me = g.character?.group?.position;
        if (me && g.fx?.spark) for (let i = 0; i < 30; i++) g.fx.spark(_v.set(me.x, me.y - 1, me.z), 0xffd36a, 0.4, _w.set((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6), 1);
        g.hud?.setVoice?.('☀️ Смерть не берёт бога', true);
    }

    // ------------------------------------------------------------------ the Hall of the Sun
    /** A god nears the Sun (Space): out of space, into the Hall (built the first time). */
    enterHall() {
        const g = this.game;
        if (this.hall || !this.data) return;
        g.space?.onRespawn?.();
        g.flight?.land?.('sunhall');
        this._hookLight();
        this.hall = { phase: 'wait', t: 0, i: 0 };
        g.sound?.playTitan?.(g.character.group.position, 'charge', 1);
        g.hud?.flash?.('#fff3c0', 1, 2000);
        g.hud?.setVoice?.('☀️ Солнце не сожгло вас. Оно открывает свой Зал…', true);
    }

    _built() {
        const d = this.data, S = SUN_HALL;
        return !!d && d.landMade(S.CX, S.CZ) && d.get(S.CX + S.MARKER.x, S.F - 1, S.CZ + S.MARKER.z) === BLOCK.GOLD && d.get(S.CX + S.R, S.F, S.CZ) !== BLOCK.AIR;
    }

    _stepHall(dt) {
        const g = this.game, d = this.data, H = this.hall, S = SUN_HALL, me = g.character.group.position;
        H.t += dt;
        const hold = () => { me.set(S.CX + S.HERO.x, S.F + GOD.HOVER, S.CZ + S.HERO.z); g.character.verticalVelocity = 0; g.knockback?.set?.(0, 0, 0); };
        if (g.isDeadLocal || g.combat?.dead) { this.hall = null; return; }
        if (H.phase === 'wait') {
            hold();
            const R = S.R + 4;
            const ready = [[0, 0], [R, R], [-R, R], [R, -R], [-R, -R]].every(([x, z]) => d.landMade(S.CX + x, S.CZ + z));
            if (!ready) { if (H.t > GOD.WAIT_MAX) this._home('Зал не загрузился'); return; }
            if (this._built()) { H.phase = 'place'; H.t = 0; return; }
            H.plan = sunHallPlan(); H.phase = 'build'; H.i = 0;
            return;
        }
        if (H.phase === 'build') {
            hold();
            const B = H.plan, end = Math.min(B.length, H.i + S.SLICE);
            for (; H.i < end; H.i++) { const b = B[H.i]; d.set(S.CX + b[0], b[1], S.CZ + b[2], b[3]); }
            if (H.i >= B.length) { this._dirty(); H.phase = 'place'; H.t = 0; }
            return;
        }
        if (H.phase === 'place') {
            hold();
            if (H.t < 0.4) return;
            this.hall = null;
            me.set(S.CX + S.HERO.x, S.F - 1.5 + PLAYER_GROUND_OFFSET + 0.1, S.CZ + S.HERO.z);
            g.faceYaw?.(0); // (north: the book, the pentagram before him)
            g.character.verticalVelocity = 0;
            g.heroApply?._upright?.();
            g.loreLibrary?.wake?.({ id: 'sunHall', x: S.CX, z: S.CZ, lore: [sunHallBookSpot()], loreBooks: ['sunGold'] });
            g.sound?.playTitan?.(me, 'anvil', 0.6);
            g.hud?.toast?.('☀️ Зал Солнца. На подставке — Золотая книга. Встаньте в круг пентаграммы и подождите — снова станете смертным. Арка на юге ведёт домой');
        }
    }

    _dirty() {
        const d = this.data, S = SUN_HALL;
        if (!d?._markDirty) return;
        for (let x = -S.R - 2; x <= S.R + 10; x += 8) for (let z = -S.R - 2; z <= S.R + 10; z += 8) d._markDirty(S.CX + Math.min(x, S.R + 2), S.CZ + Math.min(z, S.R + 2));
    }

    /** The hall is a lit room (as the potion lair: data.litLand / litShapes). */
    _hookLight() {
        const data = this.data, S = SUN_HALL;
        if (!data || data._sunHallLit) return;
        data._sunHallLit = true;
        const R = { x0: S.CX - S.R - 2, x1: S.CX + S.R + 2, z0: S.CZ - S.R - 2, z1: S.CZ + S.R + 2 };
        this.rect = R;
        const prev = data.litLand, prevS = data.litShapes;
        data.litLand = (x, z) => (prev?.(x, z)) || (x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1);
        data.litShapes = (x0, z0, x1, z1, out) => { prevS?.call(data, x0, z0, x1, z1, out); if (R.x1 >= x0 && R.x0 <= x1 && R.z1 >= z0 && R.z0 <= z1) out.push(R); return out; };
    }

    /** In the hall: the pentagram's circle (mortal again), the arch (home). */
    _inHallStep(dt) {
        const g = this.game, S = SUN_HALL, me = g.character.group.position;
        const dx = me.x - S.CX, dz = me.z - S.CZ, floorY = S.F - 1.5 + PLAYER_GROUND_OFFSET;
        this.inHall = Math.hypot(dx, dz) < S.R + 1 && Math.abs(me.y - floorY) < 8;
        if (!this.inHall) { this.pentT = 0; this.exitT = 0; return; }
        const onFloor = Math.abs(me.y - floorY) < 1.5;
        // the pentagram: stand in its circle
        if (this.state.god && onFloor && Math.hypot(dx, dz) < S.PENT_R) {
            this.pentT += dt;
            if (g.fx?.spark && Math.random() < 0.7) { const a = Math.random() * 6.28; g.fx.spark(_v.set(S.CX + Math.cos(a) * S.PENT_R, S.F - 1, S.CZ + Math.sin(a) * S.PENT_R), 0xffe9a0, 0.4, _w.set(0, 3 + Math.random() * 2, 0), 1.2); }
            if (this.pentT > 0.5 && !this._pentSaid) { this._pentSaid = true; g.hud?.setVoice?.(`☀️ Пентаграмма обнуления светится… (${S.MORTAL_T} с — и вы снова смертны; выйдите из круга, чтобы остаться богом)`, true); }
            if (this.pentT >= S.MORTAL_T) this.renounce();
        } else { this.pentT = 0; this._pentSaid = false; }
        // the arch home
        if (onFloor && Math.abs(dx - S.EXIT.x) < 2.5 && dz > S.EXIT.z - 1.5) {
            this.exitT += dt;
            if (this.exitT >= S.EXIT_T) this._home('');
        } else this.exitT = 0;
    }

    /** Mortal again (the pentagram of renewal): no immortality, the 10 000 cells taken back; the titans and bosses stay dead. */
    renounce() {
        const g = this.game;
        this.pentT = 0;
        if (!this.state.god) return;
        this.state.god = false;
        this.state.renounced = true;
        const ach = g.achievements;
        if (ach?.done?.has('godhood')) { ach.done.delete('godhood'); ach._applyBonus?.(); ach._mirror?.(); }
        if (this.state.cells && g.combat) { g.combat.maxFatigue = Math.max(1, (g.combat.maxFatigue || 0) - this.state.cells); g.combat.fatigue = Math.min(g.combat.fatigue || 0, g.combat.maxFatigue); g.combat._hudKey = ''; this.state.cells = 0; }
        g.hud?.flash?.('#ffffff', 0.9, 1400);
        g.sound?.playTitan?.(g.character.group.position, 'dark', 0.8);
        g.hud?.toast?.('🌙 Вы снова смертны. Сила богов вернулась к Солнцу. Титанов больше нет — живите простой жизнью волшебника');
    }

    /** Back on the Earth at the start (the arch; or the hall could not be made). */
    _home(why) {
        const g = this.game, d = this.data, me = g.character.group.position;
        this.hall = null;
        const y = d?.surfaceY ? d.surfaceY(0, 8) : 20;
        me.set(0, y + PLAYER_GROUND_OFFSET + 0.2, 8);
        g.character.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
        g.heroApply?._upright?.();
        g.hud?.toast?.(why ? `☀️ ${why} — вы дома, на Земле` : '🌍 Вы дома, на Земле');
    }

    // ------------------------------------------------------------------ every frame
    update(dt) {
        const g = this.game;
        if (!(dt > 0)) return;
        if (this.almostT > 0) {
            this.almostT -= dt;
            if (this.almostT <= 0) { this.almostT = 0; this.ascend(true); }
        }
        if (this.cer) this._stepAscend(dt);
        if (this.hall) this._stepHall(dt);
        else if (this.rect) this._inHallStep(dt);
        // a god's faint gold glow
        if (this.state.god && !this.cer && g.fx?.spark) {
            this._glowT -= dt;
            if (this._glowT <= 0) { this._glowT = 0.25; const me = g.character.group.position; g.fx.spark(_v.set(me.x + (Math.random() - 0.5) * 1.2, me.y - 1.5 + Math.random() * 2.5, me.z + (Math.random() - 0.5) * 1.2), 0xffd36a, 0.18, _w.set(0, 0.8, 0), 1.2); }
        }
    }

    // ------------------------------------------------------------------ the save
    snapshot() { return { god: this.state.god, renounced: this.state.renounced, cells: this.state.cells || 0 }; }
    restore(s) { if (!s) return; this.state = { god: !!s.god, renounced: !!s.renounced, cells: s.cells || 0 }; }
    dispose() { if (this.cer) this._endAscend(false); this.hall = null; }
}
