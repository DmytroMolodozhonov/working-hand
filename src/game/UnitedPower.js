/**
 * UnitedPower.js — the game part of «Пентаграмма объединённой силы» (`Pentagranium Unitas`; rules and numbers: UnitedRules.js).
 *
 * The pentagram is made by the word (Pentagranium.cast: 120 mana, +30 to the dark level, black magic). Then the hero lays in its circle (a thing LYING
 * STILL: thrown, dropped, laid by the hand, lowered by Levitation): the body of a killed man-like creature (not bones), a carnivorous plant's head and
 * TWO things of one kind. When all are there (the order does not matter) the rite begins by itself — no second word. Not all: a hint tells what is
 * missing (once per set). More than two things: «кладите ровно два». The host leads (the things are the host's); the others see it ('pgm' k 'uni').
 *
 * The rite (RITUAL_S ≈ 5.4 s, dark fire all through): 0–1.3 s the body and the head burn away in dark flame and are drawn into the circle;
 * 0.5–4.2 s the two things rise over the pentagram and wind round one common axis in a spiral, faster and faster, threads of light and fire pull
 * from them, the lines of the pentagram pulse and flare, the ground trembles; 4.2 s a flash — the two become one; the new thing hangs over the circle in
 * the halo of its colour and slowly comes down to where a hand reaches it. Everything is made of the shared spark pool, the shared flash light and the
 * pooled straight beams: nothing new in the frame; the few meshes (column, rune rings, flash, halo) are built once at the first rite and shared.
 */
import * as THREE from 'three';
import { UNITED, bodyOk, riteThing, canUnite, mergeItems, UNITED_PALETTE } from './UnitedRules.js';
import { DIVINE } from './DivineSword.js';
import { ENCHANTS, enchantSums } from './Enchant.js';
import { newUid } from './ItemTypes.js';
import { PENT } from './PentagramRules.js';
import { unitedWandSamples } from './UnitedWandModel.js';

const R = PENT.R;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const FLAME = [0x6a0a4a, 0xb0143c, 0x3a0a5a, 0x8a2be2, 0x1a0420, 0xff3a6a];
// the secret rite of the divine sword (UnitedRules.divineRecipe): the same rite, but white-gold — holy fire instead of the dark one
const HOLY = [0xffffff, 0xfff1c4, 0xffd780, 0xffc84a, 0xfff8e0, 0xcff4ff];
const LOOK = {
    dark: { flame: FLAME, ring1: 0xff7ad1, ring2: 0x9a4aff, col: 0xffffff, beamA: 0xff3a8a, beamB: 0x9a4aff, beamG: 0xb04aff, light: [0xb0143c, 0x7a2be2] },
    holy: { flame: HOLY, ring1: 0xffe29a, ring2: 0xffffff, col: 0xffd780, beamA: 0xfff1c4, beamB: 0xffffff, beamG: 0xffc84a, light: [0xffd780, 0xfff6e0] },
};
/** A weapon of the weapon system as the rite's «thing» (a Weapon is not a loose thing: its mesh is moved, its physics held — `ritual`). */
const weaponThing = (w) => ({ model: w.mesh, weapon: w, item: { kind: 'weapon', type: w.type, uid: 'w:' + w.id, magic: !!w.magic, bonus: w.bonus || 0, ench: w.ench || undefined, godGift: w.godGift || undefined } });

let _shared = null;
/** The look of the rite, built once: a dark column, two rune rings, a flash disc, a halo ring (additive, shared). */
function shared() {
    if (_shared) return _shared;
    if (typeof document === 'undefined') return (_shared = headlessLook()); // (tests / a server: the rite runs, nothing is drawn)
    const ring = document.createElement('canvas'); ring.width = ring.height = 256;
    const g = ring.getContext('2d'), h = 128;
    g.lineCap = 'round';
    const grad = g.createRadialGradient(h, h, 30, h, h, 126);
    grad.addColorStop(0, 'rgba(120,20,160,0.0)'); grad.addColorStop(0.7, 'rgba(150,20,120,0.25)'); grad.addColorStop(1, 'rgba(60,0,80,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#c04aff'; g.lineWidth = 3; g.beginPath(); g.arc(h, h, 118, 0, 6.2832); g.stroke();
    g.strokeStyle = '#ff3a6a'; g.lineWidth = 2; g.beginPath(); g.arc(h, h, 100, 0, 6.2832); g.stroke();
    let s = 29; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = '#ffb0ff'; g.lineWidth = 2;
    for (let i = 0; i < 32; i++) { // (the rune band: a fixed seed, the same on every computer)
        const a = (i / 32) * 6.2832; g.beginPath(); g.moveTo(h + Math.cos(a) * 102, h + Math.sin(a) * 102);
        for (let n = 0; n < 3; n++) { const rr = 102 + rnd() * 14, aa = a + (rnd() - 0.5) * 0.14; g.lineTo(h + Math.cos(aa) * rr, h + Math.sin(aa) * rr); }
        g.stroke();
    }
    const rune = new THREE.CanvasTexture(ring); rune.anisotropy = 4;
    const col = document.createElement('canvas'); col.width = 32; col.height = 128;
    const c = col.getContext('2d'), cg = c.createLinearGradient(0, 128, 0, 0);
    cg.addColorStop(0, 'rgba(255,60,120,0.95)'); cg.addColorStop(0.4, 'rgba(140,30,200,0.5)'); cg.addColorStop(1, 'rgba(40,0,70,0)');
    c.fillStyle = cg; c.fillRect(0, 0, 32, 128);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(0,0,0,${0.2 + (i % 3) * 0.15})`; c.fillRect(i * 6 + (i % 2) * 2, 0, 2 + (i % 2), 128); }
    const column = new THREE.CanvasTexture(col); column.wrapS = THREE.RepeatWrapping;
    const add = (map, color = 0xffffff, opacity = 1) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); cyl.translate(0, 0.5, 0);
    const halo = new THREE.TorusGeometry(1, 0.03, 6, 40); halo.rotateX(Math.PI / 2);
    for (const x of [plane, cyl, halo]) x.userData.shared = x.userData.keep = true;
    _shared = { rune, column, plane, cyl, halo, add };
    return _shared;
}

function headlessLook() {
    const add = (map, color = 0xffffff, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    return { rune: null, column: null, plane: new THREE.PlaneGeometry(1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), halo: new THREE.TorusGeometry(1, 0.03, 4, 8), add };
}

export class UnitedPower {
    constructor(game) {
        this.game = game;
        this.run = null;
        this._scanT = 0;
        this._noted = new Map(); // a set of things already told about → time
    }

    get auth() { return this.game.authority; }

    /** For Game.prewarm: the look of the rite (column, rings, flash, halo) and the united wand's shaders. */
    sampleModels() {
        const S = shared();
        return [new THREE.Mesh(S.plane, S.add(S.rune, 0xffffff, 0.4)), new THREE.Mesh(S.cyl, S.add(S.column, 0xffffff, 0.4)), new THREE.Mesh(S.halo, S.add(null, 0xb28cff, 0.4)), ...unitedWandSamples()];
    }

    _hint(key, text, every = 6000) {
        const now = performance.now();
        if (now - (this._noted.get(key) || -1e9) < every) return;
        this._noted.set(key, now);
        if (this._noted.size > 40) for (const [k, t] of this._noted) if (now - t > 60000) this._noted.delete(k);
        this.game.hud?.setVoice?.(text, true);
    }

    // ------------------------------------------------------------ what lies in the circle
    _inCircle(m, x, y, z) { return (x - m.x) ** 2 + (z - m.z) ** 2 <= (R * 0.85) ** 2 && Math.abs(y - m.y) < 3; }

    /** {bodies, heads, things, others}: what lies still in the circle of the mark `m`. */
    _contents(m) {
        const g = this.game, out = { bodies: [], heads: [], things: [], others: 0 };
        for (const b of g.death?.bodies.values() || []) {
            if (b.lev || g.death.falling?.has(b.id) || (b.netAt && performance.now() - b.netAt < 800)) continue;
            if (this._inCircle(m, b.x, b.y, b.z)) out.bodies.push(b);
        }
        for (const L of g.items.loose.values()) {
            if (!L.rest || L.hover || L.ritual || L.item.shop) continue;
            const p = L.model.position;
            if (!this._inCircle(m, p.x, p.y, p.z)) continue;
            if (L.item.kind === 'carnivoreHead') out.heads.push(L);
            else if (riteThing(L.item)) out.things.push(L); // (the Ice Rod too: whether it fits is the pair's question — canUnite)
            else out.others++;
        }
        // swords and axes are the weapon system's (Weapon), not loose things: lying still in the circle, nobody's
        for (const w of g.weapons?.weapons || []) {
            if (w.holder || w.hover || w.stuckIn || w.remoteTarget || w.ritual || !w.sleeping) continue;
            const p = w.position;
            if (this._inCircle(m, p.x, p.y, p.z)) out.things.push(weaponThing(w));
        }
        return out;
    }

    update(dt) {
        if (this.run) this._step(dt);
        const P = this.game.pentagranium;
        if (!P?.marks.size || this.run || !this.auth) return;
        this._scanT -= dt;
        if (this._scanT > 0) return;
        this._scanT = 0.35;
        for (const m of P.marks.values()) {
            if (m.pent !== 'unity' || m.fade < 0.9 || m.anim) continue;
            const c = this._contents(m);
            if (!c.bodies.length && !c.heads.length && !c.things.length) continue;
            const key = `${m.id}|${c.bodies.map((b) => b.id).join()}|${c.heads.map((l) => l.item.uid).join()}|${c.things.map((l) => l.item.uid).join()}`;
            const seen = this._noted.has(key);
            const hint = (t) => { if (!seen) this._hint(key, t, 9000); };
            if (c.things.length > 2) { hint('Кладите ровно два предмета одного вида'); continue; }
            const mp = !!this.game.net?.active; // (online: only a real player's killed body counts)
            const body = c.bodies.find((b) => bodyOk(b, { multiplayer: mp }).ok);
            if (!body) { hint(c.bodies.length ? bodyOk(c.bodies[0], { multiplayer: mp }).why : mp ? 'Нужно положить в круг тело убитого игрока (не кости)' : 'Нужно положить в круг тело убитого человекоподобного (не кости)'); continue; }
            if (!c.heads.length) { hint('Нужна головка плотоядного растения: положите её в круг'); continue; }
            if (c.things.length < 2) { hint('Нужны два предмета одного вида: положите второй'); continue; }
            const ok = canUnite(c.things[0].item, c.things[1].item);
            if (!ok.ok) { hint(ok.why); continue; }
            this._start(m, body, c.heads[0], c.things[0], c.things[1]);
            return;
        }
    }

    // ------------------------------------------------------------ the rite
    _start(m, body, headL, A, B) {
        const g = this.game;
        const r = mergeItems(A.item, B.item, { uid: newUid(), rnd: Math.random, ench: ENCHANTS.wand, enchSum: enchantSums });
        if (!r.ok) { this._hint('x' + m.id, r.why); return; }
        if (r.capped) g.hud?.setVoice?.('Предел силы: сумма урезана самым высоким пределом', true);
        const res = r.item;
        g.sync?.pentagram?.({ k: 'uni', op: 'start', id: m.id, body: body.id, head: headL.item.uid, a: A.item.uid, b: B.item.uid, res, dv: r.divine ? 1 : 0 });
        g.perf?.note?.(r.divine ? '✨ Объединённая сила: обряд божественного клинка' : '🜏 Объединённая сила: обряд');
        this._begin(m, { body, headL, A, B, res, remote: false, divine: !!r.divine });
    }

    _begin(m, { body, headL, A, B, res, remote, divine = false }) {
        const g = this.game, S = shared(), look = divine ? LOOK.holy : LOOK.dark;
        if (body) body.rit = 1;
        for (const L of [headL, A, B]) if (L) {
            L.ritual = true; L.rest = true; L.sentRest = true; L.vel?.set(0, 0, 0); L.spin?.set(0, 0, 0);
            if (L.weapon) { const w = L.weapon; w.ritual = true; w.hover = null; w.velocity.set(0, 0, 0); w.angularVelocity.set(0, 0, 0); } // (its physics held: the rite moves it)
        }
        const grp = new THREE.Group();
        grp.position.set(m.x, m.y, m.z);
        const col = new THREE.Mesh(S.cyl, S.add(S.column, 0xffffff, 0));
        col.material.color.setHex(look.col);
        const ring1 = new THREE.Mesh(S.plane, S.add(S.rune, look.ring1, 0)), ring2 = new THREE.Mesh(S.plane, S.add(S.rune, look.ring2, 0));
        const flash = new THREE.Mesh(S.plane, S.add(S.rune, 0xffffff, 0));
        const halo = new THREE.Mesh(S.halo, S.add(null, divine ? DIVINE.GOLD : UNITED_PALETTE[res?.ucol ?? 0] ?? 0xb28cff, 0));
        col.scale.set(R * 0.4, 1, R * 0.4); ring1.scale.setScalar(R * 1.1); ring2.scale.setScalar(R * 0.75);
        grp.add(col, ring1, ring2, flash, halo);
        for (const o of [col, ring1, ring2, flash, halo]) { o.renderOrder = 8; o.frustumCulled = false; }
        g.scene.add(grp);
        const pos = (L) => (L ? L.model.position.clone() : null);
        this.run = {
            m, body, headL, A, B, res, remote, divine, look, t: 0, grp, col, ring1, ring2, flash, halo,
            from: { body: body ? new THREE.Vector3(body.x, body.y, body.z) : null, head: pos(headL), a: pos(A), b: pos(B) },
            q: { a: A?.model.quaternion.clone(), b: B?.model.quaternion.clone() },
            ang: 0, merged: false, newL: null, scale0: body?.model?.scale?.x || 1, y0: body?.model?.position?.y ?? body?.y ?? m.y,
        };
        m.unityHell = 0.2;
        g.sound?.playSpellFxAt?.('thRite', _v.set(m.x, m.y, m.z), 1, 1, 22);
        g.castleLife?.alarm?.({ x: m.x, y: m.y, z: m.z }, 'dark', null, 10);
    }

    /** The rite's fire colours (dark, or the holy white-gold of the divine sword). */
    _flame() { const F = this.run?.look?.flame || FLAME; return F[(Math.random() * F.length) | 0]; }

    _dark(c, n, size = 0.34) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * 6.283, rad = Math.random() * 0.9;
            _v.set(c.x + Math.cos(a) * rad, c.y, c.z + Math.sin(a) * rad);
            fx.spark(_v, this._flame(), size * (0.5 + Math.random()), _w.set((Math.random() - 0.5) * 1.2, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 1.2), 0.9 + Math.random() * 0.9);
        }
    }

    _step(dt) {
        const r = this.run, g = this.game, m = r.m, fx = g.fx;
        r.t += dt;
        const T = UNITED.RITUAL_S, t = r.t, H = UNITED.HOVER_Y;
        const grow = ease(clamp01(t / 0.8)) * (t > T - 0.6 ? 1 - ease((t - (T - 0.6)) / 0.6) : 1);
        const spinK = clamp01((t - 0.6) / 3.6); // the spiral winds up
        // lines of the pentagram pulse and flare
        m.unityHell = Math.min(1, 0.25 + grow * 0.5 + 0.25 * Math.sin(t * (4 + 10 * spinK)) * spinK);
        // 1) the body and the head burn away in dark flame and are drawn in (0 … 1.3 s)
        const u1 = clamp01(t / 1.3);
        const b = r.body;
        if (b?.model && !r.goneBody) {
            const o = b.model, k = 1 - ease(u1);
            o.scale.setScalar(Math.max(0.02, r.scale0 * (0.25 + 0.75 * k)));
            o.position.set(r.from.body.x + (m.x - r.from.body.x) * ease(u1) * 0.8, r.y0 + u1 * 0.6, r.from.body.z + (m.z - r.from.body.z) * ease(u1) * 0.8);
            o.rotation.y += dt * (2 + 8 * u1);
        }
        if (r.headL && !r.goneHead) {
            const o = r.headL.model, f = r.from.head;
            o.position.set(f.x + (m.x - f.x) * ease(u1), f.y + 0.4 + 2.2 * Math.sin(u1 * Math.PI) * 0.6, f.z + (m.z - f.z) * ease(u1));
            o.scale.setScalar(Math.max(0.03, 1 - 0.95 * ease(u1)));
        }
        if (u1 < 1 && fx && (r._f = (r._f || 0) - dt) <= 0) {
            r._f = 0.025;
            const pt = r.from.body || { x: m.x, y: m.y, z: m.z };
            _a.set(pt.x, pt.y + 0.3, pt.z); this._dark(_a, 3, 0.4);
            if (r.from.head) { _a.copy(r.from.head); this._dark(_a, 1, 0.25); }
        }
        if (u1 >= 1 && !r.goneBody) { r.goneBody = true; this._dissolve(r); }
        // 2) the two things rise and wind round one axis (0.5 … 4.2 s)
        const rise = ease(clamp01((t - 0.4) / 1.0));
        const wind = t < 4.2 ? 1 : 0;
        if (wind) {
            const rad = (1.9 - 1.55 * spinK) * (0.35 + 0.65 * rise);
            r.ang += dt * (1.2 + 13 * spinK * spinK);
            const hov = (m.y + 0.8) + (H - 0.8) * rise + Math.sin(t * 2.2) * 0.1 * rise + spinK * 0.5;
            for (const [L, f, q0, ph, tilt] of [[r.A, r.from.a, r.q.a, 0, 1], [r.B, r.from.b, r.q.b, Math.PI, -1]]) {
                if (!L) continue;
                const o = L.model, a = r.ang + ph;
                const tx = m.x + Math.cos(a) * rad, tz = m.z + Math.sin(a) * rad;
                const lerp = ease(clamp01(t / 1.0)); // (from where it lay to its place on the spiral)
                o.position.set(f.x + (tx - f.x) * lerp, f.y + (hov - f.y) * lerp + Math.sin(a * 2) * 0.12 * spinK, f.z + (tz - f.z) * lerp);
                _v.set(0, 1, 0);
                o.quaternion.setFromAxisAngle(_v, a * 2 + Math.PI / 2).multiply(q0);
                _w.set(Math.sin(a) * 0.5 * spinK * tilt, 0, -Math.cos(a) * 0.5 * spinK * tilt); // (leans into the spin)
                o.rotateOnWorldAxis(_b.set(-Math.cos(a), 0, -Math.sin(a)), 0.5 * spinK);
            }
            // threads of light and fire: from each thing to the middle of the spiral and down to the ring
            if (fx && r.A && r.B && (r._th = (r._th || 0) - dt) <= 0) {
                r._th = 0.07 - 0.04 * spinK;
                const pa = r.A.model.position, pb = r.B.model.position, mid = _a.set(m.x, (pa.y + pb.y) / 2, m.z);
                fx.straightBeam?.(pa, mid, 0.05 + 0.04 * spinK, r.look.beamA, 0.55, 0.12, null, THREE.AdditiveBlending);
                fx.straightBeam?.(pb, mid, 0.05 + 0.04 * spinK, r.look.beamB, 0.55, 0.12, null, THREE.AdditiveBlending);
                const ga = Math.random() * 6.283;
                _b.set(m.x + Math.cos(ga) * R * 0.95, m.y + 0.1, m.z + Math.sin(ga) * R * 0.95);
                fx.straightBeam?.(_b, (Math.random() < 0.5 ? pa : pb), 0.035, r.look.beamG, 0.35, 0.15, null, THREE.AdditiveBlending);
            }
            if (fx && (r._sp = (r._sp || 0) - dt) <= 0) {
                r._sp = 0.02;
                for (const L of [r.A, r.B]) if (L) {
                    const p = L.model.position;
                    _v.copy(p).add(_w.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4));
                    fx.spark(_v, this._flame(), 0.14, _a.set(Math.sin(r.ang) * 2, 0.5 + Math.random() * 2, -Math.cos(r.ang) * 2), 0.8);
                }
                // dark flames on the pentagram's lines and smoke rising round the ring
                const a2 = Math.random() * 6.283, rad2 = R * (0.3 + 0.7 * Math.random());
                _v.set(m.x + Math.cos(a2) * rad2, m.y + 0.1, m.z + Math.sin(a2) * rad2);
                fx.spark(_v, this._flame(), 0.3 + 0.2 * spinK, _a.set(-Math.sin(a2) * 1.5, 1.5 + Math.random() * 3.5 * (0.5 + spinK), Math.cos(a2) * 1.5), 1.2);
            }
        }
        // the light: a dark column, two rune rings turning against each other
        r.col.material.opacity = 0.5 * grow; r.col.scale.y = (H + 3) * clamp01(t / 0.7); r.col.rotation.y += dt * (0.8 + 3 * spinK);
        r.ring1.position.y = 0.3 + H * 0.45 * rise; r.ring2.position.y = 0.3 + H * 0.85 * rise;
        r.ring1.rotation.y += dt * (1.2 + 5 * spinK); r.ring2.rotation.y -= dt * (1.8 + 7 * spinK);
        r.ring1.material.opacity = 0.75 * grow; r.ring2.material.opacity = 0.6 * grow;
        // light on the ground, a trembling earth
        if (fx && (r._lf = (r._lf || 0) - dt) <= 0) { r._lf = 0.1; fx.lightFlash?.(_v.set(m.x, m.y + 1.8, m.z), r.look.light[Math.random() < 0.5 ? 0 : 1], (1.4 + 2.2 * spinK) * grow, 0.2, R * 4 + 8); }
        const me = g.character.group.position, dist = Math.hypot(me.x - m.x, me.z - m.z);
        if (fx && dist < 45) fx.shake = Math.max(fx.shake || 0, (0.05 + 0.3 * spinK * spinK) * Math.max(0, 1 - dist / 45) * grow);
        if (t > 1.5 && t - dt <= 1.5) g.sound?.playMagic?.(r.grp.position, 0.7);
        // 3) the flash: the two become one
        if (!r.merged && t >= 4.2) this._flashMerge();
        if (r.merged) {
            const f = (t - 4.2) / 1.2;
            r.flash.material.opacity = Math.max(0, 1 - f * 1.4) * 0.95; r.flash.scale.setScalar(R * (2 + 3 * f)); r.flash.position.y = 0.1;
            // the new thing hangs in its halo and slowly comes down
            const L = r.newL;
            if (L && L.hover) {
                const y = m.y + 1.8 + (H - 1.8) * (1 - ease(clamp01((t - 4.4) / 1.0))) + (L.weapon ? 1.2 : 0);
                L.hover.y = y; L.model.position.y = y;
                if (L.weapon) { // (a blade: it hangs point down over the circle and turns slowly, shining)
                    L.model.position.x = m.x; L.model.position.z = m.z;
                    L.model.quaternion.setFromAxisAngle(_v.set(0, 1, 0), t * 1.4).multiply(_q.setFromAxisAngle(_w.set(1, 0, 0), Math.PI));
                    L.model.updateMatrixWorld(true);
                }
                r.halo.position.set(m.x, y, m.z);
                r.halo.scale.setScalar(0.5 + 0.1 * Math.sin(t * 6));
                r.halo.rotation.y += dt * 2;
                r.halo.material.opacity = 0.85 * (1 - clamp01((t - (T - 0.8)) / 0.8));
            } else r.halo.material.opacity = 0;
        }
        if (t >= T) this._finish();
    }

    /** The body's flames go out and it is gone; the head too (every computer: the host removes the head from the world). */
    _dissolve(r) {
        const g = this.game, m = r.m;
        this._dark({ x: m.x, y: m.y + 0.3, z: m.z }, 26, 0.5);
        if (r.body && g.death?.bodies.has(r.body.id)) g.death.removeBody(r.body.id, false);
        r.goneHead = true;
        if (r.headL) {
            const h = r.headL.item;
            if ((h.count || 1) > 1) { h.count--; const o = r.headL.model; o.scale.setScalar(1); o.position.copy(r.from.head); r.headL.ritual = false; r.headL.noPick = performance.now() + 400; } // (a stack: one head is used, the rest stays)
            else if (this.auth) { g.items.removeLoose(h.uid); g.sync?.itemGone?.(h.uid, null, null); } else g.items.removeLoose(h.uid);
            r.headL = null;
        }
    }

    _flashMerge() {
        const r = this.run, g = this.game, m = r.m, fx = g.fx, H = UNITED.HOVER_Y;
        r.merged = true;
        const at = _a.set(m.x, m.y + H, m.z).clone();
        const col = r.divine ? DIVINE.GOLD : UNITED_PALETTE[r.res?.ucol ?? 0] ?? 0xb28cff;
        // the two things are gone, one is born
        for (const L of [r.A, r.B]) if (L) {
            if (L.weapon) { const w = L.weapon; if (g.weapons.byId.has(w.id)) { if (this.auth) g.sync?.weaponGone?.(w); g.weapons.remove(w); } continue; } // (a sword / an axe: the weapon system's)
            const u = L.item.uid; g.items.removeLoose(u); if (this.auth) g.sync?.itemGone?.(u, null, null);
        }
        r.A = r.B = null;
        if (this.auth && r.res) r.newL = r.res.kind === 'weapon' ? this._spawnWeapon(r.res, at) : g.items.spawnLoose(r.res, at, { hover: true });
        if (r.divine && !r.remote) g.achievements?.gain?.('divineBlade'); // (the first divine sword: +100 cells — not one of «Высший маг»'s)
        if (fx) {
            for (let i = 0; i < 110; i++) {
                const a = Math.random() * 6.283, up = (Math.random() - 0.4) * 7, sp = 3 + Math.random() * 8;
                fx.spark(at, i % 3 === 0 ? 0xffffff : i % 3 === 1 ? col : this._flame(), 0.16 + Math.random() * 0.14, _w.set(Math.cos(a) * sp, up, Math.sin(a) * sp), 1 + Math.random() * 0.8);
            }
            fx.lightFlash?.(at, col, 7, 0.7, R * 6 + 14);
            fx.shake = Math.max(fx.shake || 0, 0.6 * Math.max(0, 1 - Math.hypot(g.character.group.position.x - m.x, g.character.group.position.z - m.z) / 45));
        }
        g.sound?.playMagic?.(r.grp.position, 1);
        if (r.divine) {
            g.sound?.playSpellFxAt?.('fxDivineBirth', _v.set(m.x, m.y + 2, m.z), 1.1, 1, 30);
            if (fx) { // (a pillar of white light to the sky and a ring of gold dust on the ground)
                _b.set(m.x, m.y + 60, m.z);
                fx.straightBeam?.(at, _b, 0.6, 0xfff6e0, 0.9, 1.2, null, THREE.AdditiveBlending);
                for (let i = 0; i < 48; i++) { const a = (i / 48) * 6.283; _v.set(m.x + Math.cos(a) * R * 0.9, m.y + 0.15, m.z + Math.sin(a) * R * 0.9); fx.spark(_v, i % 2 ? 0xffd780 : 0xffffff, 0.22, _w.set(Math.cos(a) * 1.5, 2.5 + Math.random() * 2, Math.sin(a) * 1.5), 1.4); }
            }
            if (!r.remote) g.hud?.setVoice?.('✦ <b style="color:#ffe6a8">Свет поглотил обе вещи</b>: над кругом рождается клинок', true);
        } else {
            g.sound?.playSpellFxAt?.('fxPentagram', _v.set(m.x, m.y, m.z), 1, 0.8, 22);
            if (!r.remote) g.hud?.setVoice?.('✦ <b style="color:#c9a8ff">Силы объединились</b>: над кругом новая вещь — заберите её', true);
        }
    }

    /** The result is a weapon (a sword / an axe merged, or the divine sword): the weapon system's, floating over the circle. → the rite's «thing». */
    _spawnWeapon(it, at) {
        const g = this.game, W = g.weapons;
        if (!W) return null;
        const w = W.spawn(it.type, at.clone(), new THREE.Quaternion(), undefined);
        if (it.magic) W.markMagic(w, it.bonus || 1);
        if (it.ench) w.ench = it.ench;
        w.ritual = true; w.sleeping = true; // (the rite holds it: it hangs, turns and comes down — _step)
        g.sync?.weaponAppeared?.(w, true);
        const L = weaponThing(w);
        L.hover = { y: at.y };
        return L;
    }

    _finish() {
        const r = this.run, g = this.game, m = r.m;
        this.run = null;
        g.scene.remove(r.grp);
        for (const o of [r.col, r.ring1, r.ring2, r.flash, r.halo]) o.material.dispose();
        for (const L of [r.A, r.B, r.headL]) if (L) { L.ritual = false; L.rest = false; L.sentRest = false; L.noPick = performance.now() + 500; if (L.weapon) { L.weapon.ritual = false; L.weapon.wake(); } }
        if (r.newL) r.newL.noPick = performance.now() + 300;
        if (r.newL?.weapon) { const w = r.newL.weapon; w.ritual = false; w.wake(); w.angularVelocity.set(0, 0.6, 0); } // (it lets go and comes down onto the circle — a real fall, it lies there to be taken)
        m.unityHell = 0;
        m.life = Math.min(m.life, 8); // (the pentagram burns on a little and goes out)
    }

    // ------------------------------------------------------------ network
    /** Another computer's rite ('pgm' k 'uni'): the host leads; here it is only shown (the things themselves come from the host's messages). */
    onNet(m) {
        const g = this.game;
        if (m.op !== 'start' || this.run || this.auth) return;
        const mark = g.pentagranium?.marks.get(m.id);
        if (!mark || mark.pent !== 'unity') return;
        const thing = (u) => { if (typeof u === 'string' && u.startsWith('w:')) { const w = g.weapons?.byId.get(u.slice(2)); return w ? weaponThing(w) : null; } return g.items.loose.get(u) || null; };
        const body = g.death?.bodies.get(m.body) || null, headL = g.items.loose.get(m.head) || null, A = thing(m.a), B = thing(m.b);
        if (!A || !B) return; // (the things are not here yet: nothing to show)
        this._begin(mark, { body, headL, A, B, res: m.res && typeof m.res === 'object' ? { ucol: m.res.ucol | 0 } : null, remote: true, divine: m.dv === 1 });
    }
}
