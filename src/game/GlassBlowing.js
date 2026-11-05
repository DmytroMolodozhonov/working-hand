/**
 * GlassBlowing.js — «Create a Flask»: empty flasks for potions blown by magic out of sand or glass (the author 05.11: «отдельное
 * заклинание… 5 песка в интерфейсе — колба; 10 — сразу две; либо палочку на песок, либо на стекло; осколки стекла в интерфейсе или
 * рядом — одна колба из одного стекла»).
 *
 *   What it takes (the first that has enough): glass shards lying where the wand points (FLASK.PILE_R of the point) — 1 a flask;
 *   sand blocks the wand points at (a patch of sand: FLASK.SAND a flask, at most FLASK.MAX_BLOCKS flasks a cast); then the slots —
 *   glass shards (1 a flask), sand (FLASK.SAND a flask: 10 sand → 2). At most FLASK.MAX flasks a cast. Creative: one flask from nothing.
 *   The look (every computer: 'gblow'): the grains / the shards rise in a spiral to a point before the hand, melt into a glowing drop
 *   (orange → white), it swells like blown glass and cools clear; the flasks drift into the hand's reach and go into the slots (a full
 *   pack: they fall at the feet as things).
 *   Who/what (FLASK_TARGETS): sand and glass only — a window of a house is somebody's (not taken), creatures and other blocks: nothing.
 * «А если»: no room in the slots — on the ground; the caster dies mid-way — the flasks fall where the drop was; under water — sand of the
 * bottom works (glass is blown in a bubble); two casts — two drops.
 */
import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { newUid } from './ItemTypes.js';
import { flaskModel } from './CauldronModel.js';

export const FLASK = { SAND: 5, MAX: 10, MAX_BLOCKS: 2, PILE_R: 3.5, REACH: 12, T: 3.2 };

/** What it acts on (the rule «кто/что × как»). */
export const FLASK_TARGETS = {
    sand: `${FLASK.SAND} sand a flask (blocks under the wand or in the slots)`, glass: '1 glass shard a flask (on the ground or in the slots)',
    window: 'no — a house\'s window is somebody\'s', creature: 'no', block: 'no (only sand)',
};

/** How many flasks the slots give, and what they use: {n, glass, sand} (pure). */
export function flasksFromSlots(slots, max = FLASK.MAX) {
    let glass = 0, sand = 0;
    for (const s of slots || []) {
        if (!s) continue;
        if (s.kind === 'glass') glass += s.count || 1;
        else if (s.kind === 'res' && s.block === BLOCK.SAND) sand += s.count || 0;
    }
    const g = Math.min(glass, max), sN = Math.min(Math.floor(sand / FLASK.SAND), max - g);
    return { n: g + sN, glass: g, sand: sN * FLASK.SAND };
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class GlassBlowing {
    constructor(game) { this.game = game; this.list = []; }

    /** «Create a Flask» (Game: a building spell). → a hint (nothing taken) or null. */
    cast() {
        const g = this.game, B = g.builder;
        const h = B?._hand?.();
        if (!h) return '⚗️ Поднимите руку с палочкой: на песок или осколки стекла (или держите их в ячейках) — и скажите «Create a Flask»';
        const creative = g.config?.mode === 'creative';
        let n = 0, used = null, src = 'slots';
        // 1) glass shards lying where the wand points
        const hit = g.terrain?.raycast?.(h.o, h.d, FLASK.REACH);
        const point = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : null;
        if (point) {
            const pile = [];
            for (const L of g.items?.loose?.values?.() || []) if (L.item?.kind === 'glass' && !L.accio && !L.lev && L.model.position.distanceTo(point) <= FLASK.PILE_R) pile.push(L);
            const have = pile.reduce((a, L) => a + (L.item.count || 1), 0);
            if (have > 0) { n = Math.min(have, FLASK.MAX); used = { pile }; src = 'pile'; }
        }
        // 2) sand blocks under the wand
        if (!n) {
            const cell = B._hitCell?.(h.o, h.d, FLASK.REACH);
            if (cell && cell.type === BLOCK.SAND) {
                const cells = B._flood(cell, (t) => t === BLOCK.SAND, 3, FLASK.SAND * FLASK.MAX_BLOCKS);
                const k = Math.floor(cells.length / FLASK.SAND);
                if (!k && !creative) return `⚗️ Здесь мало песка — на колбу нужно ${FLASK.SAND} блоков`;
                n = Math.max(1, k); used = { cells: cells.slice(0, Math.max(1, k) * FLASK.SAND) }; src = 'sand';
            }
        }
        // 3) the slots
        if (!n) {
            const s = flasksFromSlots(g.inventory?.slots);
            if (s.n) { n = s.n; used = { slots: s }; src = 'slots'; }
        }
        if (!n && creative) { n = 1; src = 'none'; }
        if (!n) {
            const s = flasksFromSlots(g.inventory?.slots, 99);
            return s.sand || (g.inventory?.slots || []).some((x) => x?.kind === 'res' && x.block === BLOCK.SAND) ? `⚗️ На колбу нужно ${FLASK.SAND} песка или 1 осколок стекла` : '⚗️ Нужен песок (5 на колбу) или осколки стекла — в ячейках, на земле под палочкой или блоки песка';
        }
        // use it up
        const from = [], uids = [];
        if (used?.pile) {
            let need = n;
            for (const L of used.pile) {
                if (need <= 0) break;
                from.push(L.model.position.toArray().map((v) => Math.round(v * 100) / 100));
                const c = L.item.count || 1;
                if (c <= need) { need -= c; uids.push(L.item.uid); g.items.removeLoose(L.item.uid); g.sync?.itemGone?.(L.item.uid); } else { L.item.count = c - need; need = 0; }
            }
        } else if (used?.cells) {
            const edits = [];
            for (const c of used.cells) { g.terrain.data.set(c.x, c.L, c.z, BLOCK.AIR); edits.push([c.x, c.L, c.z, BLOCK.AIR]); from.push([c.x, c.L - 1, c.z]); }
            B._sendEdits?.(edits);
        } else if (used?.slots) {
            let glass = used.slots.glass, sand = used.slots.sand;
            for (const s of [...(g.inventory?.slots || [])]) {
                if (!s) continue;
                if (s.kind === 'glass' && glass > 0) { const k = Math.min(glass, s.count || 1); g.inventory.take(s, k); glass -= k; }
                else if (s.kind === 'res' && s.block === BLOCK.SAND && sand > 0) { const k = Math.min(sand, s.count); g.inventory.take(s, k); sand -= k; }
            }
        }
        // the drop: before the hand (or over the pile / the sand)
        const at = h.o.clone().addScaledVector(h.d, 1.6);
        at.y += 0.3;
        const msg = { t: 'gblow', id: 'gb' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), x: at.x, y: at.y, z: at.z, n, src, f: from.slice(0, 12), u: uids, by: g.localId };
        this.start(msg, true);
        g.sync?.net?.send?.(msg, true);
        g.hud?.setVoice?.(`⚗️ ${src === 'sand' || (src === 'slots' && used?.slots?.sand) ? 'Песок' : 'Стекло'} плавится в каплю — выдувается ${n > 1 ? n + ' колбы' : 'колба'}…`, true);
        return null;
    }

    /** The look (every computer); `mine`: the flasks go into my slots at the end. */
    start(m, mine = false) {
        const g = this.game;
        if (!g.scene || !Number.isFinite(+m.x) || this.list.some((F) => F.id === m.id)) return;
        const at = new THREE.Vector3(+m.x, +m.y, +m.z);
        const n = Math.max(1, Math.min(FLASK.MAX, m.n | 0));
        const flasks = [];
        for (let i = 0; i < n; i++) {
            const f = flaskModel(null);
            f.scale.setScalar(0.001);
            f.visible = false;
            g.scene.add(f);
            flasks.push(f);
        }
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2a1a0a, emissive: 0xff8a2a, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95 }));
        drop.scale.setScalar(0.001);
        drop.position.copy(at);
        g.scene.add(drop);
        const from = (m.f || []).map((p) => new THREE.Vector3(p[0], p[1] + 0.5, p[2]));
        if (!from.length) for (let i = 0; i < 5; i++) from.push(at.clone().add(_v.set(Math.cos(i * 1.3) * 1.2, -1.2, Math.sin(i * 1.3) * 1.2)));
        this.list.push({ id: m.id, at, t: 0, drop, flasks, from, sand: m.src === 'sand' || m.src === 'slots', mine, n });
        g.sound?.spellCast?.('CreateFlask', at);
    }

    update(dt) {
        if (!this.list.length) return;
        const g = this.game, fx = g.fx, T = FLASK.T;
        for (let i = this.list.length - 1; i >= 0; i--) {
            const F = this.list[i];
            F.t += dt;
            const k = F.t / T;
            // 0–0.35: grains / shards spiral up to the point
            if (k < 0.35 && Math.random() < dt * 60) {
                const s = F.from[(Math.random() * F.from.length) | 0];
                const a = Math.random() * Math.PI * 2;
                _v.copy(s).add(_v2.set(Math.cos(a) * 0.4, Math.random() * 0.3, Math.sin(a) * 0.4));
                _v2.subVectors(F.at, _v).multiplyScalar(2.6).add(_v.clone().sub(F.at).cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(0.8));
                fx?.spark(_v, F.sand ? (Math.random() < 0.5 ? 0xe6d29a : 0xcdb27f) : (Math.random() < 0.5 ? 0xbfe8f5 : 0xffffff), 0.05, _v2, 0.45);
            }
            // 0.25–0.6: the drop melts together, glowing; 0.6–0.85: it swells (blown), cools clear
            const D = F.drop;
            if (k < 0.85) {
                const grow = Math.min(1, Math.max(0, (k - 0.2) / 0.3));
                const swell = k > 0.6 ? 1 + (k - 0.6) / 0.25 * 0.8 : 1;
                D.scale.set(grow * swell, grow * swell * (1 + Math.sin(F.t * 16) * 0.06), grow * swell);
                D.position.copy(F.at).add(_v.set(0, Math.sin(F.t * 3) * 0.05, 0));
                const cool = k > 0.6 ? (k - 0.6) / 0.25 : 0;
                D.material.emissive.setRGB(1, 0.55 + 0.4 * (1 - cool) * Math.min(1, grow), 0.17 + 0.6 * cool * 0 + 0.2 * (1 - cool));
                D.material.emissiveIntensity = 0.9 * (1 - cool);
                D.material.color.setRGB(0.16 + 0.6 * cool, 0.1 + 0.75 * cool, 0.05 + 0.8 * cool);
                D.material.opacity = 0.95 - 0.55 * cool;
                if (Math.random() < dt * 20 * grow) fx?.spark(D.position, cool > 0.5 ? 0xdff6ff : 0xffb347, 0.04, _v2.set((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2), 0.4);
            } else D.visible = false;
            // 0.82–1: the flasks come out of it, one beside another
            if (k > 0.82) {
                const e = Math.min(1, (k - 0.82) / 0.18), ee = 1 - Math.pow(1 - e, 3);
                F.flasks.forEach((f, j) => {
                    f.visible = true;
                    const a = (j / F.n) * Math.PI * 2;
                    f.position.set(F.at.x + Math.cos(a) * 0.35 * ee * (F.n > 1 ? 1 : 0), F.at.y + 0.1 * ee, F.at.z + Math.sin(a) * 0.35 * ee * (F.n > 1 ? 1 : 0));
                    f.scale.setScalar(Math.max(0.001, ee * 2.2));
                    f.rotation.y += dt * 2;
                });
            }
            if (F.t >= T + 0.4) { this._finish(F); this.list.splice(i, 1); }
        }
    }

    _finish(F) {
        const g = this.game;
        F.drop.parent?.remove(F.drop); F.drop.geometry.dispose(); F.drop.material.dispose();
        for (const f of F.flasks) { f.parent?.remove(f); f.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
        if (!F.mine) return;
        // (a stack of flasks holds 5: given in fives; what finds no room falls at the drop)
        let left = F.n, fell = 0;
        while (left > 0) {
            const item = { kind: 'flask', uid: newUid(), count: Math.min(5, left) };
            left -= item.count;
            if (g.inventory?.storeItem?.(item)) continue;
            fell += item.count;
            if (g.items?.spawnLoose && (g.items.auth || !g.sync)) g.items.spawnLoose(item, F.at.clone(), { vel: _v.set(0, 0.5, 0) });
            else g.sync?.itemThrow?.(item, F.at.clone(), _v.set(0, 0.5, 0));
        }
        g.hud?.setVoice?.(fell ? '⚗️ Ячейки заняты — колбы упали рядом' : `⚗️ ${F.n > 1 ? `${F.n} пустые колбы` : 'Пустая колба'} — в ячейках. Окуните её в котёл с готовым зельем`, true);
    }

    onNet(m) {
        const g = this.game;
        if (m.t !== 'gblow' || m.by === g.localId) return;
        // (the host: the shards a guest took off the ground are gone for everybody)
        if (g.authority && Array.isArray(m.u)) for (const uid of m.u.slice(0, FLASK.MAX)) if (g.items?.loose?.has(uid)) { g.items.removeLoose(uid); g.sync?.itemGone?.(uid); }
        this.start(m, false);
    }
}
