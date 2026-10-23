/**
 * EnchantCircles.js — the game part of «Пентаграмма зачарования» (rules and numbers: Enchant.js).
 *
 * The circle is permanent (drawn once, stands for ever, saved with the world). The pentagram drawing/learning module
 * (Pentagram*.js) calls `add(x, y, z)` when an `enchant` drawing is recognised (`PENTAGRAMS.enchant`, scroll burnt);
 * `known()` asks it whether the hero has learned the drawing (Creative: always).
 *
 * A thing LYING STILL inside the circle (thrown, dropped, laid by the hand, lowered by Levitation) starts the rite —
 * one at a time; two things: «Кладите по одному предмету». The host leads (the things are the host's); the payer is
 * the hero near the circle (30 % of the CURRENT mana, rounded up; under MIN_MANA nothing starts, nothing is spent).
 * The rite (RITUAL_S): the thing rises and turns above the circle, a column of light, two rune rings, a flash — the level
 * is told at the flash (enchantTier from the mana spent, never pure chance), the thing sinks down enchanted.
 * Seen by everybody ('ench' op start / done); the level is rolled by the host and sent with 'done'.
 */
import * as THREE from 'three';
import { ENCHANT, ENCHANT_DRAW, ENCHANT_TIERS, enchantCost, enchantTier, canEnchant, applyEnchant, enchantKind } from './Enchant.js';
import { glowMaterial } from '../fx/EnchantGlow.js';
import { armorName } from './ArmorTypes.js';

const R = ENCHANT.RADIUS;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ease = (t) => t * t * (3 - 2 * t);

let _decalTex = null, _colTex = null, _decalGeo = null, _colGeo = null, _discGeo = null;

/** The circle on the ground: gold double ring, rune band, the rhombus-crystal with its spark, glow (drawn once, 512²). */
export function decalTexture() {
    if (_decalTex) return _decalTex;
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), h = S / 2, k = h * 0.94;
    const glow = g.createRadialGradient(h, h, k * 0.2, h, h, k * 1.02);
    glow.addColorStop(0, 'rgba(185,140,255,0.10)'); glow.addColorStop(0.8, 'rgba(185,140,255,0.22)'); glow.addColorStop(1, 'rgba(185,140,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
    g.lineCap = g.lineJoin = 'round';
    const line = (col, w, a) => { g.strokeStyle = col; g.lineWidth = w; g.globalAlpha = a; };
    for (const d of ENCHANT_DRAW) { // the drawing itself (units of the radius)
        if (d.t === 'circle') {
            line('#ffd36e', d.r === 1 ? 5 : 3, 0.95); g.beginPath(); g.arc(h, h, d.r * k, 0, 6.2832); g.stroke();
            if (d.r === 1) { line('#c9a8ff', 2, 0.9); g.beginPath(); g.arc(h, h, k * 0.9, 0, 6.2832); g.stroke(); g.beginPath(); g.arc(h, h, k * 0.78, 0, 6.2832); g.stroke(); }
            else { g.fillStyle = '#fff6dc'; g.globalAlpha = 0.9; g.beginPath(); g.arc(h, h, d.r * k * 0.55, 0, 6.2832); g.fill(); }
        } else {
            line('#ffd36e', 4, 0.95);
            g.beginPath();
            d.pts.forEach(([x, y], i) => (i ? g.lineTo(h + x * k * 0.78, h + y * k * 0.78) : g.moveTo(h + x * k * 0.78, h + y * k * 0.78)));
            g.closePath(); g.stroke();
            line('#c9a8ff', 2, 0.8); // the facets of the crystal
            g.beginPath(); g.moveTo(h, h - 0.86 * k * 0.78); g.lineTo(h, h + 0.86 * k * 0.78); g.moveTo(h - 0.52 * k * 0.78, h); g.lineTo(h + 0.52 * k * 0.78, h); g.stroke();
        }
    }
    // the rune band between the two outer rings: 36 signs, each a few strokes (a fixed seed — the same on every computer)
    let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    line('#ffe9a8', 2.4, 0.9);
    for (let i = 0; i < 36; i++) {
        const a = (i / 36) * 6.2832, r0 = k * 0.795, r1 = k * 0.885;
        g.beginPath();
        let px = h + Math.cos(a) * r0, py = h + Math.sin(a) * r0;
        g.moveTo(px, py);
        for (let n = 0; n < 3; n++) {
            const rr = r0 + rnd() * (r1 - r0), aa = a + (rnd() - 0.5) * 0.12;
            px = h + Math.cos(aa) * rr; py = h + Math.sin(aa) * rr; g.lineTo(px, py);
        }
        g.stroke();
    }
    g.fillStyle = '#fff6dc'; // sparks at the four tips of the crystal's cross
    for (const [x, y] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { g.globalAlpha = 0.95; g.beginPath(); g.arc(h + x * k * 0.97, h + y * k * 0.97, 5, 0, 6.2832); g.fill(); }
    _decalTex = new THREE.CanvasTexture(c);
    _decalTex.anisotropy = 4;
    return _decalTex;
}

/** The column: bright at the foot, fading up, with faint vertical streaks. */
function columnTexture() {
    if (_colTex) return _colTex;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, 'rgba(255,246,220,0.95)'); grad.addColorStop(0.35, 'rgba(201,168,255,0.55)'); grad.addColorStop(1, 'rgba(201,168,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 128);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + (i % 3) * 0.12})`; g.fillRect(i * 7 + (i % 2) * 2, 0, 2 + (i % 3), 128); }
    _colTex = new THREE.CanvasTexture(c);
    _colTex.wrapS = THREE.RepeatWrapping;
    return _colTex;
}

const geos = () => {
    if (!_decalGeo) {
        _decalGeo = new THREE.PlaneGeometry(1, 1); _decalGeo.rotateX(-Math.PI / 2);
        _colGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true); _colGeo.translate(0, 0.5, 0);
        _discGeo = new THREE.RingGeometry(0.62, 1, 48); _discGeo.rotateX(-Math.PI / 2);
        for (const x of [_decalGeo, _colGeo, _discGeo]) x.userData.shared = true;
    }
};
const addMat = (map, color = 0xffffff, opacity = 1) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class EnchantCircles {
    constructor(game) {
        this.game = game;
        this.list = []; // {id, x, y, z, mesh}
        this.run = null; // the rite going now (mine to lead, or one seen: remote)
        this._scanT = 0;
        this._noted = new Map(); // uid -> the last hint's time (a thing is told about once while it lies there)
        this._seen = new Set(); // uids lying in some circle now
        this._sets = new Set();
        this._decalMat = null;
        this._t = 0;
    }

    /** Has the hero learned the drawing? (the pentagram module says; Creative knows all) */
    known() {
        const g = this.game;
        if (g.config?.mode === 'creative') return true;
        const p = g.pentagrams;
        return p?.knows ? !!p.knows('enchant') : true;
    }

    add(x, y, z, id = null) {
        geos();
        id = id || `ec${this.list.length}_${Math.round(x)}_${Math.round(z)}`;
        if (this.list.some((c) => c.id === id)) return null;
        if (!this._decalMat) { this._decalMat = addMat(decalTexture(), 0xffffff, 0.8); this._decalMat.polygonOffset = true; this._decalMat.polygonOffsetFactor = -2; this._decalMat.polygonOffsetUnits = -2; this._decalMat.userData.shared = true; }
        const mesh = new THREE.Mesh(_decalGeo, this._decalMat);
        mesh.scale.set(R * 2, 1, R * 2);
        mesh.position.set(x, y + 0.07, z);
        mesh.renderOrder = 3;
        mesh.frustumCulled = true;
        this.game.scene.add(mesh);
        const c = { id, x, y, z, mesh };
        this.list.push(c);
        return c;
    }

    remove(id) {
        const i = this.list.findIndex((c) => c.id === id);
        if (i < 0) return;
        this.game.scene.remove(this.list[i].mesh);
        this.list.splice(i, 1);
    }

    snapshot() { return this.list.map((c) => [c.id, Math.round(c.x * 100) / 100, Math.round(c.y * 100) / 100, Math.round(c.z * 100) / 100]); }
    restore(a) { for (const c of [...this.list]) this.remove(c.id); for (const [id, x, y, z] of a || []) this.add(x, y, z, id); }

    /** For Game.prewarm: every look of the rite and the circle, once, so no shader is built in play. */
    sampleModels() {
        geos();
        return [
            new THREE.Mesh(_decalGeo, addMat(decalTexture(), 0xffffff, 0.5)),
            new THREE.Mesh(_colGeo, addMat(columnTexture(), 0xffffff, 0.5)),
            new THREE.Mesh(_discGeo, addMat(decalTexture(), 0xffffff, 0.5)),
        ];
    }

    // ----------------------------------------------------------------- what lies in a circle
    _inCircle(c, p) { return (p.x - c.x) ** 2 + (p.z - c.z) ** 2 <= (R - 0.4) ** 2 && Math.abs(p.y - c.y) < 3; }

    /** Things lying still in circle `c`: [{uid, item, L|w}]. */
    _inside(c) {
        const g = this.game, out = [];
        for (const L of g.items.loose.values()) {
            if (!L.rest || L.hover || L.ritual || L.item.shop) continue;
            if (this._inCircle(c, L.model.position)) out.push({ uid: L.item.uid, item: L.item, L });
        }
        for (const w of g.weapons?.weapons || []) {
            if (w.holder || w.hover || !w.sleeping || w.ritual) continue;
            if (this._inCircle(c, w.position)) out.push({ uid: 'w:' + w.id, item: { kind: 'weapon', type: w.type, ench: w.ench || undefined }, w });
        }
        return out;
    }

    _hint(key, text, every = 6000) {
        const now = performance.now();
        if (now - (this._noted.get(key) || -1e9) < every) return;
        this._noted.set(key, now);
        if (this._noted.size > 60) for (const [k, t] of this._noted) if (now - t > 60000) this._noted.delete(k);
        this.game.hud?.setVoice?.(text, true);
    }

    /** The mana the hero has now (Creative: the whole bar — it never limits), and whether the rite pays it. */
    _mana() {
        const cb = this.game.combat;
        return cb.enabled ? cb.fatigue : (cb.maxFatigue || cb.fatigue || 0);
    }

    update(dt) {
        this._t += dt;
        if (this.list.length) {
            const me = this.game.character.group.position;
            const pulse = 0.7 + 0.12 * Math.sin(this._t * 1.7);
            if (this._decalMat) this._decalMat.opacity = pulse;
            for (const c of this.list) c.mesh.visible = (c.x - me.x) ** 2 + (c.z - me.z) ** 2 < 160 * 160;
        }
        if (this.run) this._step(dt);
        if (!this.list.length || this.run || !this.game.authority || !this.known()) return;
        this._scanT -= dt;
        if (this._scanT > 0) return;
        this._scanT = 0.3;
        const g = this.game, me = g.character.group.position;
        for (const c of this.list) {
            if ((c.x - me.x) ** 2 + (c.z - me.z) ** 2 > 40 * 40) continue; // (the payer must be near: it is his mana and his rite)
            const inside = this._inside(c);
            const uids = new Set(inside.map((e) => e.uid));
            for (const u of [...this._seen]) if (!uids.has(u)) { this._seen.delete(u); this._noted.delete(u); } // (left the circle: told again next time)
            if (!inside.length) continue;
            if (inside.length > 1) {
                const key = inside.map((e) => e.uid).sort().join('|');
                for (const e of inside) this._seen.add(e.uid);
                if (!this._sets.has(key)) { this._sets.add(key); if (this._sets.size > 20) this._sets.clear(); this._hint('many', 'Кладите по одному предмету', 3000); }
                continue;
            }
            const e = inside[0];
            this._seen.add(e.uid);
            if (this._noted.has(e.uid)) continue; // (already told, or refused: until it leaves and comes back)
            const ok = canEnchant(e.item);
            if (!ok.ok) { this._noted.set(e.uid, performance.now()); g.hud?.setVoice?.(ok.why, true); continue; }
            const mana = this._mana();
            if (mana < ENCHANT.MIN_MANA) { this._noted.set(e.uid, performance.now()); g.hud?.setVoice?.('Слишком мало маны', true); continue; }
            this._start(c, e, mana);
            return;
        }
    }

    // ----------------------------------------------------------------- the rite
    _start(c, e, mana) {
        const g = this.game, cb = g.combat;
        const spent = enchantCost(mana);
        if (cb.enabled) cb.fatigue = Math.max(0, cb.fatigue - spent);
        const tier = enchantTier(spent, Math.random);
        const from = (e.L ? e.L.model.position : e.w.position).clone();
        this._begin({ c, uid: e.uid, L: e.L, w: e.w, from, tier, spent, remote: false, name: this._name(e.item) });
        g.sync?.net?.send({ t: 'ench', op: 'start', cid: c.id, uid: e.uid, o: [from.x, from.y, from.z], by: g.localId }, true);
    }

    _name(item) {
        if (item.kind === 'armor' || item.kind === 'robe') return armorName(item);
        return { weapon: item.type === 'axe' ? 'Топор' : 'Меч', bow: 'Лук', shield: 'Щит', wand: 'Палочка' }[item.kind] || 'Предмет';
    }

    _begin(r) {
        const g = this.game;
        geos();
        const c = r.c, top = ENCHANT.HOVER_Y;
        const grp = new THREE.Group();
        grp.position.set(c.x, c.y, c.z);
        const tint = ENCHANT_TIERS[r.tier ?? 1].color;
        const col = new THREE.Mesh(_colGeo, addMat(columnTexture(), 0xd8c4ff, 0));
        col.scale.set(R * 0.42, 1, R * 0.42);
        const disc1 = new THREE.Mesh(_discGeo, addMat(decalTexture(), 0xffe9a8, 0)), disc2 = new THREE.Mesh(_discGeo, addMat(decalTexture(), 0xc9a8ff, 0));
        disc1.scale.setScalar(R * 0.55); disc2.scale.setScalar(R * 0.4);
        const flash = new THREE.Mesh(_decalGeo, addMat(decalTexture(), 0xffffff, 0));
        grp.add(col, disc1, disc2, flash);
        g.scene.add(grp);
        if (r.L) { r.L.ritual = true; r.L.rest = true; r.L.sentRest = true; r.L.vel?.set(0, 0, 0); }
        if (r.w) { r.w.ritual = true; r.w.sleeping = true; }
        // a remote rite: find the thing by its uid (the host's start message) so it rises here too
        if (r.remote && !r.L && !r.w) { const L = g.items.loose.get(r.uid); if (L) { r.L = L; L.ritual = true; L.rest = true; L.sentRest = true; r.from = L.model.position.clone(); } }
        this.run = { ...r, grp, col, disc1, disc2, flash, t: 0, top, angle: 0, flashed: false, tint, q0: (r.L ? r.L.model : r.w?.mesh)?.quaternion.clone() || new THREE.Quaternion() };
        g.sound?.playTempleChime?.(grp.position);
    }

    _item() { const r = this.run; return r.L ? r.L.item : r.w ? { kind: 'weapon', type: r.w.type } : null; }
    _body() { const r = this.run; return r.L ? r.L.model : r.w ? r.w.mesh : null; }

    _step(dt) {
        const r = this.run, g = this.game, c = r.c;
        r.t += dt;
        const T = ENCHANT.RITUAL_S, t = r.t, rise = ease(Math.min(1, t / 0.9)), settle = t > T - 0.7 ? ease((t - (T - 0.7)) / 0.7) : 0;
        const grow = ease(Math.min(1, t / 0.8)) * (1 - settle * 0.9);
        const body = this._body();
        if (body) {
            const y = r.from.y + (c.y + 0.6 - r.from.y) * rise + (r.top - 0.6) * rise * (1 - settle) + Math.sin(t * 2.4) * 0.12 * rise * (1 - settle);
            body.position.set(r.from.x + (c.x - r.from.x) * rise, Math.max(c.y + 0.4, y), r.from.z + (c.z - r.from.z) * rise);
            r.angle += dt * (1.5 + 7 * Math.min(1, t / (T * 0.7))) * (1 - settle * 0.7);
            _v.set(0, 1, 0);
            body.quaternion.setFromAxisAngle(_v, r.angle).multiply(r.q0);
            if (r.w) r.w.position.copy(body.position);
        }
        // the light: a column, two rune rings turning against each other, sparks spiralling up
        r.col.material.opacity = 0.55 * grow; r.col.scale.y = (r.top + 3) * Math.min(1, t / 0.6);
        r.disc1.position.y = 0.4 + (r.top * 0.55) * rise; r.disc2.position.y = 0.4 + (r.top * 0.9) * rise;
        r.disc1.rotation.y += dt * 1.6; r.disc2.rotation.y -= dt * 2.4;
        r.disc1.material.opacity = 0.7 * grow; r.disc2.material.opacity = 0.6 * grow;
        r.col.rotation.y += dt * 0.8;
        if (g.fx && (r._spark = (r._spark || 0) - dt) <= 0) {
            r._spark = 0.03;
            const a = t * 5 + Math.random() * 6.28, rad = R * (0.5 + Math.random() * 0.4) * (1 - 0.5 * rise);
            _v.set(c.x + Math.cos(a) * rad, c.y + 0.3, c.z + Math.sin(a) * rad);
            _w.set(-Math.sin(a) * 1.5, 3 + Math.random() * 3, Math.cos(a) * 1.5);
            g.fx.spark(_v, Math.random() < 0.5 ? 0xffd36e : 0xc9a8ff, 0.12, _w, 1.1);
        }
        if (t > T * 0.5 && t - dt <= T * 0.5) g.sound?.playTempleChime?.(r.grp.position);
        // the flash: the level is told, the thing is enchanted
        if (!r.flashed && t >= T - 0.9) this._flash();
        if (r.flashed) { const f = (t - (T - 0.9)) / 0.9; r.flash.material.opacity = Math.max(0, 1 - f) * 0.9; r.flash.scale.setScalar(R * (2 + 2.5 * f)); r.flash.position.y = 0.1; }
        if (t >= T) this._finish();
    }

    _flash() {
        const r = this.run, g = this.game;
        r.flashed = true;
        if (!r.remote) {
            const item = r.L ? r.L.item : r.w ? r.w : null;
            const target = r.w ? { kind: 'weapon', type: r.w.type } : item;
            const ench = applyEnchant(target, r.tier);
            if (ench) {
                if (r.w) r.w.ench = ench; // (the blade's shell: Weapon.ench)
                else r.L.item.ench = ench;
                if (r.L) this._reskin(r.L);
            }
            g.sync?.net?.send({ t: 'ench', op: 'done', cid: r.c.id, uid: r.uid, tier: r.tier, kind: ench?.kind || enchantKind(target) }, true);
            const T = ENCHANT_TIERS[r.tier];
            g.hud?.setVoice?.(`✦ <b style="color:${T.glow}">${T.ru} зачарование</b>: ${r.name} (ушло маны: ${r.spent})`, true);
        }
        this._burst(r.tier);
        g.sound?.playMagic?.(r.grp.position, 1);
    }

    /** The thing's look made again, now with its shell (the model is replaced in place). */
    _reskin(L) {
        const g = this.game, old = L.model;
        const pos = old.position.clone(), q = old.quaternion.clone();
        g.items._putAway(L); g.items._bringBack(L);
        L.model.position.copy(pos); L.model.quaternion.copy(q);
        L.shape = g.items._shapeOf(L.model);
    }

    _burst(tier) {
        const g = this.game, r = this.run, T = ENCHANT_TIERS[tier];
        const n = 40 + tier * 30;
        const o = _v.set(r.c.x, r.c.y + ENCHANT.HOVER_Y * 0.8, r.c.z).clone();
        for (let i = 0; i < n; i++) {
            const a = Math.random() * 6.283, up = (Math.random() - 0.3) * 6, sp = 3 + Math.random() * (5 + tier * 2);
            g.fx?.spark(o, i % 3 === 0 ? 0xffffff : T.color, 0.14 + tier * 0.03, _w.set(Math.cos(a) * sp, up, Math.sin(a) * sp), 0.9 + Math.random() * 0.5);
        }
    }

    _finish() {
        const r = this.run, g = this.game;
        this.run = null;
        g.scene.remove(r.grp);
        for (const m of [r.col, r.disc1, r.disc2, r.flash]) m.material.dispose();
        if (r.L) {
            r.L.ritual = false; r.L.rest = false; r.L.sentRest = false; r.L.noPick = performance.now() + 500;
            r.L.vel?.set(0, 0, 0); r.L.spin?.set(0, 0, 0);
            this._noted.set(r.uid, performance.now()); // (it lies there enchanted: no hint again — canEnchant refuses it quietly)
        }
        if (r.w) { r.w.ritual = false; r.w.wake?.(); }
    }

    /** Another computer's rite ('ench'): the host leads and sends the start and the result. */
    onNet(m) {
        if (!m || m.by === this.game.localId) return;
        const c = this.list.find((x) => x.id === m.cid);
        if (m.op === 'start' && c && !this.run && Array.isArray(m.o)) {
            this._begin({ c, uid: m.uid, from: new THREE.Vector3(+m.o[0] || c.x, +m.o[1] || c.y, +m.o[2] || c.z), tier: 1, spent: 0, remote: true, name: '' });
        } else if (m.op === 'done') {
            const tier = Math.max(0, Math.min(3, m.tier | 0));
            const L = this.game.items.loose.get(m.uid);
            if (L && m.kind) { L.item.ench = { tier, kind: String(m.kind) }; this._reskin(L); }
            if (this.run?.remote) { this.run.tier = tier; this._flash(); }
        }
    }
}
