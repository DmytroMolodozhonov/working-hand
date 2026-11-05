/**
 * CauldronForge.js — «Create a Cauldron»: a cauldron for brewing cast out of the metal of three armour pieces (the author 05.11: «нужно иметь
 * 3 типа металлической брони… неважно, магическая или нет… могут быть одинаковыми. Наводишь палочкой, или если они у тебя в интерфейсе —
 * происходит магия: из их металла создаётся чан»).
 *
 *   Where the metal comes from: armour pieces (ItemTypes kind 'armor': a helmet, a breastplate, greaves — plate steel, magic or not, any
 *   three, the same ones too) lying where the wand points (within FORGE.PILE_R of the point, up to FORGE.REACH m), then the slots. A robe
 *   is cloth: not metal. Creative: no armour needed (three ghostly pieces are melted for the look).
 *   The look (every computer: the caster sends 'cforge'): GATHER — the pieces rise and fly together over the spot, turning; HEAT — they
 *   circle, glowing dull red → orange → white-hot, sparks off them; MELT — they shrink into one ball of molten metal, drops fall hissing;
 *   CAST — the ball sinks and spreads: the cauldron grows out of it, glowing, a splash ring on the ground; COOL — it darkens to iron,
 *   steam rises, a ringing clang. Then it is a real cauldron (Cauldrons.spawn: water, fire, brewing — as any other).
 *   Who/what it acts on (FORGE_TARGETS): only the armour pieces it takes; creatures, blocks, other things: nothing (it melts what it is
 *   given, it does not burn round it). The host makes the cauldron (a guest asks: 'cforgemk'); the pieces are used up at the cast.
 * «А если»: the caster dies / leaves / is knocked down mid-way — the cauldron is cast anyway (the metal is already molten); two casts — two
 * cauldrons; space / hell — not there (no ground of the Earth's: Space.js blocks building spells); under water — it is cast on the
 * bottom (steam bubbles); too many cauldrons of players (FORGE.MAX) — refused before anything is taken.
 */
import * as THREE from 'three';
import { makeItemModel, disposeModel } from './ItemTypes.js';
import { makeCauldronModel } from './CauldronModel.js';

export const FORGE = {
    NEED: 3, // armour pieces
    REACH: 14, // m the wand reaches for a pile
    PILE_R: 3.5, // m round the point
    MAX: 40, // cauldrons made by this spell in the world
    T_GATHER: 1.3, T_HEAT: 1.5, T_MELT: 1.1, T_CAST: 1.4, T_COOL: 1.6, // s of each phase
    HIGH: 2.6, // m over the ground the metal melts at
};
const T_END = FORGE.T_GATHER + FORGE.T_HEAT + FORGE.T_MELT + FORGE.T_CAST + FORGE.T_COOL;

/** What it acts on (the rule «кто/что × как»). */
export const FORGE_TARGETS = {
    armor: 'melted into the cauldron (used up)',
    robe: 'no — cloth, not metal',
    weapon: 'no — only armour is taken (a sword stays a sword)',
    creature: 'no — the spell melts what it is given, it does not burn round it',
    block: 'no', ship: 'no', water: 'cast on the bottom under it',
};

/** Is this thing metal armour the spell can melt? */
export const isForgeMetal = (it) => !!it && it.kind === 'armor';

/** The heat colour of iron by 0…1 (dull red → orange → yellow-white). */
export function heatColor(k, out = new THREE.Color()) {
    const a = Math.max(0, Math.min(1, k));
    if (a < 0.5) return out.setRGB(0.3 + a * 1.2, 0.03 + a * 0.3, 0.0); // (dull red → red-orange)
    return out.setRGB(0.9 + (a - 0.5) * 0.2, 0.18 + (a - 0.5) * 0.7, 0.02 + (a - 0.5) * 0.25); // (→ orange-yellow: never a white blot — the shape must read)
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color();

export class CauldronForge {
    constructor(game) {
        this.game = game;
        this.list = []; // the casts being shown
        this.made = 0;
    }

    /** «Create a Cauldron» (Game, a building spell). → a hint (not cast, nothing taken) or null (cast). */
    cast() {
        const g = this.game, B = g.builder;
        const h = B?._hand?.();
        if (!h) return '🫕 Поднимите руку с палочкой: покажите на доспехи на земле (или держите их в ячейках) и скажите «Create a Cauldron»';
        if ((g.cauldrons?.list?.size || 0) >= FORGE.MAX + 30 || this.made >= FORGE.MAX) return '🫕 Котлов в мире и так много';
        const creative = g.config?.mode === 'creative';
        const hit = g.terrain?.raycast?.(h.o, h.d, FORGE.REACH);
        const point = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : h.o.clone().addScaledVector(h.d, 5);
        // the pieces: lying near the point first, then the slots
        const take = [];
        for (const L of g.items?.loose?.values?.() || []) {
            if (take.length >= FORGE.NEED) break;
            if (!isForgeMetal(L.item) || L.accio || L.lev) continue;
            if (L.model.position.distanceTo(point) > FORGE.PILE_R) continue;
            take.push({ loose: L, kind: L.item.piece, magic: !!L.item.magic, from: L.model.position.clone() });
        }
        const slots = [];
        for (const s of g.inventory?.slots || []) if (isForgeMetal(s)) slots.push(s);
        for (const s of slots) { if (take.length >= FORGE.NEED) break; take.push({ slot: s, kind: s.piece, magic: !!s.magic, from: null }); }
        if (take.length < FORGE.NEED && !creative) {
            const n = take.length;
            return n ? `🫕 Нужно 3 металлических доспеха (любые: шлем, нагрудник, поножи), а здесь ${n}` : '🫕 Нужно 3 металлических доспеха — покажите палочкой на них на земле или держите их в ячейках';
        }
        while (take.length < FORGE.NEED) take.push({ ghost: true, kind: ['helmet', 'chest', 'legs'][take.length], magic: false, from: null }); // (Creative)
        // where: the point (on the ground), or before the hero when the metal comes from the slots
        const me = g.character.group.position;
        let at = point;
        if (!take.some((t) => t.loose)) { const f = _v.set(-Math.sin(g.character.group.rotation.y), 0, -Math.cos(g.character.group.rotation.y)); at = new THREE.Vector3(me.x + f.x * 4.5, 0, me.z + f.z * 4.5); }
        at.y = g.collision?.groundY ? g.collision.groundY(at.x, at.z) : at.y;
        // use them up (the metal is in the spell now)
        const from = [], uids = [];
        for (const t of take) {
            if (t.loose) { from.push(t.from.toArray().map((v) => Math.round(v * 100) / 100)); uids.push(t.loose.item.uid); g.items.removeLoose(t.loose.item.uid); g.sync?.itemGone?.(t.loose.item.uid); }
            else { from.push(null); if (t.slot) g.inventory.take(t.slot, 1); }
        }
        const yaw = g.character.group.rotation.y;
        const id = 'forge:' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
        const msg = { t: 'cforge', id, x: at.x, y: at.y, z: at.z, yaw, k: take.map((t) => t.kind), m: take.map((t) => (t.magic ? 1 : 0)), f: from, u: uids, by: g.localId }; // (u: the pieces taken off the ground — the host removes them for everybody)
        this.start(msg, true);
        g.sync?.net?.send?.(msg, true);
        g.castleLife?.alarm?.({ x: at.x, y: at.y, z: at.z }, 'magic', g.localId, 6); // (a glowing blaze of metal: the people near look)
        g.hud?.setVoice?.('🫕 Доспехи взлетают и раскаляются — из их металла отливается котёл…', true);
        return null;
    }

    /** A cast shown (every computer); `mine`: this computer makes the cauldron at the end (the host makes it; a guest asks the host). */
    start(m, mine = false) {
        const g = this.game;
        if (!g.scene || !Number.isFinite(+m.x)) return;
        if (this.list.some((F) => F.id === m.id)) return;
        const at = new THREE.Vector3(+m.x, +m.y, +m.z);
        const me = g.character?.group?.position;
        const pieces = [];
        (m.k || []).slice(0, FORGE.NEED).forEach((kind, i) => {
            const model = makeItemModel({ kind: 'armor', piece: ['helmet', 'chest', 'legs'].includes(kind) ? kind : 'chest', magic: !!m.m?.[i] });
            // its own materials (they glow): cloned, disposed at the end; the shapes stay shared
            model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData = { forge: true }; } });
            const f = m.f?.[i];
            const start = Array.isArray(f) ? new THREE.Vector3(f[0], f[1], f[2]) : (me ? me.clone().add(_v.set((i - 1) * 0.8, 1.4, 0)) : at.clone().add(_v.set((i - 1) * 2, 1, 2)));
            model.position.copy(start);
            g.scene.add(model);
            pieces.push({ model, start, ph: i * (Math.PI * 2 / 3), spin: new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize() });
        });
        // the molten ball: one sphere of glowing iron (its own material: the heat colour)
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff7a20, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.7 }));
        ball.scale.setScalar(0.001);
        ball.position.copy(at).add(_v.set(0, FORGE.HIGH, 0));
        g.scene.add(ball);
        // the cauldron being cast: its model glowing, growing out of the ball, cooling
        const { group } = makeCauldronModel({ old: false });
        group.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData = { forge: true }; if (o.material.emissive) o.material.emissive.set(0); } });
        group.position.copy(at);
        group.rotation.y = +m.yaw || 0;
        group.scale.setScalar(0.001);
        group.visible = false;
        g.scene.add(group);
        this.list.push({ id: m.id, at, yaw: +m.yaw || 0, t: 0, pieces, ball, group, mine, by: m.by, steamT: 0, clang: false });
        g.sound?.spellCast?.('CreateCauldron', at);
    }

    update(dt) {
        if (!this.list.length) return;
        const g = this.game, fx = g.fx;
        for (let i = this.list.length - 1; i >= 0; i--) {
            const F = this.list[i];
            F.t += dt;
            const t = F.t, top = _v2.copy(F.at).add(_v.set(0, FORGE.HIGH, 0));
            const t1 = FORGE.T_GATHER, t2 = t1 + FORGE.T_HEAT, t3 = t2 + FORGE.T_MELT, t4 = t3 + FORGE.T_CAST;
            // the pieces: gather → circle and heat → shrink into the ball
            for (const p of F.pieces) {
                const m = p.model;
                if (t < t1) {
                    const k = t / t1, e = k * k * (3 - 2 * k);
                    const ring = _v.set(Math.cos(p.ph) * 1.6, 0, Math.sin(p.ph) * 1.6).add(top);
                    m.position.lerpVectors(p.start, ring, e);
                    m.position.y += Math.sin(Math.PI * k) * 1.5; // (an arc up)
                    if (Math.random() < dt * 30) fx?.spark(m.position, 0xcfd6de, 0.08, _v.set(0, 0.5, 0), 0.5);
                } else if (t < t3) {
                    const a = p.ph + (t - t1) * (2.2 + (t - t1) * 1.6); // (faster and faster)
                    const r = t < t2 ? 1.6 : 1.6 * (1 - (t - t2) / FORGE.T_MELT);
                    m.position.set(top.x + Math.cos(a) * r, top.y + Math.sin(t * 3 + p.ph) * 0.15, top.z + Math.sin(a) * r);
                    const heat = Math.min(1, (t - t1) / FORGE.T_HEAT);
                    heatColor(heat, _c);
                    m.traverse((o) => { if (o.isMesh && o.material.emissive) { o.material.emissive.copy(_c); o.material.emissiveIntensity = 0.25 + heat * 0.75; } });
                    if (t > t2) m.scale.setScalar(Math.max(0.001, 1 - (t - t2) / FORGE.T_MELT));
                    if (Math.random() < dt * (10 + heat * 40)) fx?.spark(m.position, heat > 0.6 ? 0xffd27a : 0xff7a20, 0.07 + heat * 0.06, _v.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.5);
                } else m.visible = false;
                m.rotateOnAxis(p.spin, dt * (2 + t));
            }
            // the ball of molten iron
            const B = F.ball;
            if (t >= t2 && t < t4) {
                const grow = Math.min(1, (t - t2) / FORGE.T_MELT);
                const sink = t > t3 ? (t - t3) / FORGE.T_CAST : 0;
                const wob = 1 + Math.sin(t * 13) * 0.05;
                B.scale.set(1.05 * grow * wob * (1 + sink * 0.6), 1.05 * grow * (1 - sink * 0.8) / wob, 1.05 * grow * wob * (1 + sink * 0.6));
                B.position.set(F.at.x, F.at.y + FORGE.HIGH * (1 - sink) + 0.6 * sink, F.at.z);
                heatColor(1 - sink * 0.2, B.material.emissive);
                // drops of molten metal fall from it
                if (Math.random() < dt * 25) fx?.spark(_v.set(B.position.x + (Math.random() - 0.5), B.position.y - 0.6, B.position.z + (Math.random() - 0.5)), 0xff9a3c, 0.1, _v2.set((Math.random() - 0.5) * 1.5, -2 - Math.random() * 3, (Math.random() - 0.5) * 1.5), 0.7);
            } else B.visible = t < t4 && t >= t2;
            // the cauldron cast out of it: it grows, glowing, then cools to iron
            if (t >= t3) {
                const G = F.group;
                G.visible = true;
                const k = Math.min(1, (t - t3) / FORGE.T_CAST), e = 1 - Math.pow(1 - k, 3);
                G.scale.set(0.2 + 0.8 * e, 0.05 + 0.95 * e, 0.2 + 0.8 * e);
                const cool = t > t4 ? Math.min(1, (t - t4) / FORGE.T_COOL) : 0;
                heatColor(1 - cool * 0.9, _c);
                G.traverse((o) => { if (o.isMesh && o.material.emissive) { o.material.emissive.copy(_c); o.material.emissiveIntensity = 0.95 * (1 - cool) * (1 - cool); } });
                if (!F.ring && k > 0.15) {
                    F.ring = true; // (the splash of molten metal round its feet)
                    for (let j = 0; j < 36; j++) { const a = (j / 36) * Math.PI * 2; fx?.spark(_v.set(F.at.x + Math.cos(a) * 1.8, F.at.y + 0.15, F.at.z + Math.sin(a) * 1.8), j % 2 ? 0xffb347 : 0xff6a1a, 0.13, _v2.set(Math.cos(a) * 3, 1.5 + Math.random() * 1.5, Math.sin(a) * 3), 0.6); }
                }
                if (t > t4) {
                    F.steamT -= dt;
                    if (F.steamT <= 0) { F.steamT = 0.05; fx?.spark(_v.set(F.at.x + (Math.random() - 0.5) * 2.4, F.at.y + 2.7, F.at.z + (Math.random() - 0.5) * 2.4), 0xe8ecf0, 0.28 * (1 - cool * 0.6), _v2.set((Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6), 1.4); }
                    if (!F.clang) { F.clang = true; g.sound?.playClang?.(1.2); }
                }
            }
            if (t >= T_END) { this._finish(F); this.list.splice(i, 1); }
        }
    }

    /** The cast is over: the look goes, the real cauldron stands where it was cast. */
    _finish(F) {
        const g = this.game;
        for (const p of F.pieces) { p.model.parent?.remove(p.model); p.model.traverse((o) => { if (o.isMesh && o.material.userData?.forge) o.material.dispose(); }); disposeModel(p.model); }
        F.ball.parent?.remove(F.ball); F.ball.geometry.dispose(); F.ball.material.dispose();
        F.group.parent?.remove(F.group); F.group.traverse((o) => { if (o.isMesh && o.material.userData?.forge) o.material.dispose(); });
        if (!F.mine) return;
        this.made++;
        const rec = { id: F.id, x: F.at.x, y: F.at.y, z: F.at.z, yaw: F.yaw, tilt: 0, tdir: 0 };
        if (g.authority || !g.sync) this.make(rec); else g.sync?.net?.send?.({ t: 'cforgemk', ...rec }, true);
        g.hud?.setVoice?.('🫕 Котёл отлит! Налейте воды («Waterbollow») и разведите под ним огонь («Fire»)', true);
    }

    /** (host) The cauldron of a finished cast. */
    make(rec) {
        const g = this.game;
        if (!g.cauldrons || g.cauldrons.list.has(rec.id)) return;
        const c = g.cauldrons.spawn(rec);
        g.cauldrons._send?.(c);
    }

    onNet(m) {
        const g = this.game;
        if (m.t === 'cforge') {
            if (m.by === g.localId) return;
            // (the host: the pieces a guest took off the ground are gone for everybody)
            if (g.authority && Array.isArray(m.u)) for (const uid of m.u.slice(0, FORGE.NEED)) if (g.items?.loose?.has(uid)) { g.items.removeLoose(uid); g.sync?.itemGone?.(uid); }
            this.start(m, false);
        }
        else if (m.t === 'cforgemk' && (this.game.authority || !this.game.sync) && typeof m.id === 'string' && m.id.startsWith('forge:')) this.make({ id: m.id, x: +m.x, y: +m.y, z: +m.z, yaw: +m.yaw || 0, tilt: 0, tdir: 0 });
    }

    clear() { for (const F of this.list) { F.mine = false; this._finish(F); } this.list.length = 0; }
}
