/**
 * Offerings.js — the game part of what must lie on a pentagram before its ritual begins (rules and numbers: PentagramOfferings.js).
 *
 *   «Pentagranium Gargoylis» — 3 bodies of killed man-like creatures, then 150 mana: the bodies burn in dark flame, the ritual goes as it always did.
 *   «Pentagranium Monstrum»  — the horn of a Minotaur and 1 body, then 200 mana: they burn; the hero stands in the circle and changes as before.
 *   «Pentagranium Breakward» — 1 body, then 50 mana: it burns; the hero steps into the circle and the protection is broken as before (BreakwardMark.activate).
 * Only outside Creative (Pentagranium.cast sets `m.offer`); in Creative the word alone works, as before.
 *
 * The flow (on the caster's computer — his mana, his ritual; the others see it by 'pgm' k 'ofr'):
 *   wait   — every 0.35 s the lit pentagram `m.offer` is looked at: the bodies lying still in the circle (Death) and the things lying still on it (Items.loose).
 *            Not all there: a hint says what is missing (once per set). All there and the ritual can begin: …
 *   charge — CHARGE s of dark flame gathers over the things (nothing is spent; they are locked: nobody can pick them up). Any trouble — a body carried off,
 *            a thing taken, the caster killed, the pentagram out — cancels it with a hint, the things stay where they lay.
 *   commit — checked once more, then the mana is paid (gargoyles: Gargoyles.startRitual pays and begins; monster: 200 mana, `m.prepaid`), the things are taken off
 *   burn   — the bodies sink and shrink into ash (BURN s), the horn goes in sparks; every computer plays it. Then the ritual runs as ever.
 * The monster rite then waits for the hero to stand in the circle (PentagramMonster.stand — as before); the gargoyles come out by themselves.
 */
import * as THREE from 'three';
import { OFFERINGS, OFFER, OFFER_HINT, assess } from './PentagramOfferings.js';
import { manaRules } from './HeroSetup.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const FLAME = [0x6a0a4a, 0xb0143c, 0x3a0a5a, 0x8a2be2, 0x1a0420, 0xff3a6a, 0xff5a14];
const WHY = {
    off: '🜏 Горгульи сейчас не выпускаются в этом мире',
    realm: '🜏 Здесь, вне земли, пентаграмма горгулий молчит — встаньте на землю',
    spent: '🜏 Здесь пентаграмма уже выжжена: горгульи вылетали отсюда — выберите другое место',
    busy: '🜏 Рядом уже идёт ритуал горгулий — подождите, пока он закончится',
};

export class Offerings {
    constructor(game) {
        this.game = game;
        this.run = null; // the rite gathering over a pentagram {m, bodies, things, t, remote}
        this.burns = []; // bodies and things burning away {b, t, x, y, z, scale0, y0, id}
        this._scanT = 0;
        this._cool = 0; // s: after a cancelled rite the same things are not tried again at once (no flicker of flame)
        this._noted = new Map(); // a set already told about → time
    }

    get P() { return this.game.pentagranium; }
    get creative() { return this.game.config?.mode === 'creative' || this.game.config?.mode === 'test'; }
    get online() { return !!this.game.net?.active; }

    _hint(key, text, every = OFFER.HINT_EVERY) {
        const now = performance.now();
        if (now - (this._noted.get(key) || -1e9) < every) return;
        this._noted.set(key, now);
        if (this._noted.size > 40) for (const [k, t] of this._noted) if (now - t > 60000) this._noted.delete(k);
        this.game.hud?.setVoice?.(text, true);
    }

    // ------------------------------------------------------------ what lies on the circle
    _inCircle(m, x, y, z) { return (x - m.x) ** 2 + (z - m.z) ** 2 <= (m.r * OFFER.REACH_K) ** 2 && Math.abs(y - m.y) < 3; }

    /** {bodies, things, any}: what lies still in the circle of the mark `m` (bodies already in a rite are not counted). */
    _contents(m) {
        const g = this.game, out = { bodies: [], things: [], any: false };
        for (const b of g.death?.bodies.values() || []) {
            if (b.lev || b.off || g.death.falling?.has(b.id) || (b.netAt && performance.now() - b.netAt < 800)) continue;
            if (!this._inCircle(m, b.x, b.y, b.z)) continue;
            out.bodies.push(b); out.any = true;
        }
        // (an animal's carcass — not its bones — is a body too: the hell's pentagram takes any killed creature — HellRules.anyBody)
        for (const a of g.animals?.list || []) {
            if (!a.dead || a.bonesAt || a.airborne || a.offered) continue;
            const q = a.group?.position;
            if (!q || !this._inCircle(m, q.x, q.y, q.z)) continue;
            out.bodies.push({ id: 'an' + a.id, k: 'a', animal: a, x: q.x, y: q.y, z: q.z, model: a.group }); out.any = true;
        }
        for (const [uid, L] of g.items?.loose || []) {
            if (!L.rest || L.hover || L.ritual || L.item?.shop) continue;
            const p = L.model?.position;
            if (!p || !this._inCircle(m, p.x, p.y, p.z)) continue;
            out.things.push({ uid, item: L.item, L }); out.any = true;
        }
        return out;
    }

    // ------------------------------------------------------------ the wait
    update(dt) {
        if (this.burns.length) this._burnStep(dt);
        if (this.run) { this._runStep(dt); return; }
        const P = this.P;
        if (!P?.marks.size) return;
        this._scanT -= dt; this._cool -= dt;
        if (this._scanT > 0 || this._cool > 0) return;
        this._scanT = OFFER.SCAN;
        const g = this.game;
        if (g.isDeadLocal || g.combat?.dead) return;
        for (const m of P.marks.values()) {
            if (!m.offer || !m.mine || m.fade < 0.9 || m.anim) continue;
            const c = this._contents(m);
            if (!c.any) continue;
            const key = `${m.id}|${c.bodies.map((b) => b.id).join()}|${c.things.map((t) => t.uid).join()}`;
            const a = assess(m.offer, c, { playersOnly: false });
            if (!a.ok) { this._hint(key, '🜏 ' + a.text + (a.bad ? ` (${a.bad})` : '')); continue; }
            const why = this._canBegin(m);
            if (why) { this._hint(key + '|c', why); continue; }
            this._begin(m, a);
            return;
        }
    }

    /** Everything but the final payment: may the rite begin now? → null, or the text of the refusal. */
    _canBegin(m) {
        const g = this.game, need = OFFERINGS[m.offer], c = g.combat;
        const center = { x: m.x, y: m.y, z: m.z };
        if (m.offer === 'gargoyles') {
            const can = g.gargoyles?.canRitual?.(center);
            if (can && !can.ok) return WHY[can.why] || '🜏 Ритуал сейчас не начать';
        } else if (m.offer === 'monster') {
            if (g.monster?.phase) return '🐺 Вы уже монстр';
        } else if (m.offer === 'breakward') {
            if (g.breakward?.marked) return '🜏 Защита уже сломана — второй раз не нужно';
        } else if (m.offer === 'infernum' || m.offer === 'hellBack') {
            if (m.gateOpen > 0) return null; // (already open: nothing more is burnt — HellGate.js)
        }
        if (manaRules(g) && (c?.fatigue || 0) < need.mana) return '🜏 ' + OFFER_HINT.noMana(need.mana, c?.fatigue || 0);
        return null;
    }

    // ------------------------------------------------------------ the dark flame gathers
    _begin(m, a) {
        const g = this.game;
        if (m.gateOpen > 0) return; // (the gates stand open: the next body is not taken)
        for (const b of a.bodies) { b.off = 1; if (b.animal) b.animal.offered = true; }
        for (const t of a.things) { t.L.ritual = true; t.L.rest = true; t.L.sentRest = true; t.L.vel?.set(0, 0, 0); t.L.spin?.set(0, 0, 0); }
        const at = [...a.bodies.map((b) => [b.x, b.y, b.z]), ...a.things.map((t) => [t.L.model.position.x, t.L.model.position.y, t.L.model.position.z])];
        this.run = { m, bodies: a.bodies, things: a.things, at, t: 0, remote: false };
        m.life = Math.max(m.life, 20);
        g.sync?.pentagram?.({ k: 'ofr', op: 'charge', id: m.id, at: at.map((p) => p.map((n) => Math.round(n * 10) / 10)) });
        g.sound?.playSpellFxAt?.('thRite', _v.set(m.x, m.y, m.z), 1, 1, 22);
        g.castleLife?.alarm?.({ x: m.x, y: m.y, z: m.z }, 'dark', g.localId, 10); // (black magic: the people fear it)
        g.hud?.setVoice?.(OFFER_HINT.start, true);
        g.perf?.note?.(`🜏 Приношение на пентаграмме: ${m.offer}`);
    }

    _flames(at, u, n = 4) {
        const fx = this.game.fx;
        if (!fx) return;
        for (const p of at) for (let i = 0; i < n; i++) {
            const a = Math.random() * 6.283, r = Math.random() * 1.1;
            fx.spark(_v.set(p[0] + Math.cos(a) * r, p[1] + 0.1 + Math.random() * 0.4, p[2] + Math.sin(a) * r), FLAME[(Math.random() * FLAME.length) | 0], 0.26 + 0.2 * u * Math.random(),
                _d.set((Math.random() - 0.5) * 1.2, 2 + Math.random() * (3 + 3 * u), (Math.random() - 0.5) * 1.2), 0.9 + Math.random() * 0.8);
        }
    }

    _runStep(dt) {
        const R = this.run, g = this.game, m = R.m, P = this.P;
        R.t += dt;
        const u = Math.min(1, R.t / OFFER.CHARGE);
        if (m) m.offerHell = Math.min(1, 0.3 + 0.7 * u * (0.8 + 0.2 * Math.sin(R.t * (5 + 10 * u))));
        if (R.remote) { // (watching the caster's rite: it ends by his message, or by itself after a little while)
            if (m) m.life = Math.max(m.life, 8);
            this._flames(R.at, u, 3);
            if (R.t > OFFER.CHARGE + 6) this._endRun(false);
            return;
        }
        if (m) m.life = Math.max(m.life, 12);
        this._flames(R.at, u);
        if ((R._f = (R._f || 0) - dt) <= 0) { R._f = 0.12; g.fx?.lightFlash?.(_v.set(m.x, m.y + 1.2, m.z), 0xff3a6a, 1.5 + 3 * u, 0.25, m.r * 4 + 10); }
        // trouble cancels it: nothing is spent
        if (g.isDeadLocal || g.combat?.dead) return this._cancel(OFFER_HINT.cancelDead);
        if (!P?.marks.has(m.id)) return this._cancel(OFFER_HINT.cancelGone);
        if (R.bodies.some((b) => (b.animal ? !g.animals?.list.includes(b.animal) || b.animal.bonesAt : !g.death?.bodies.has(b.id)) || b.lev || !this._inCircle(m, b.x, b.y, b.z)) || R.things.some((t) => !g.items?.loose.has(t.uid) || !this._inCircle(m, t.L.model.position.x, t.L.model.position.y, t.L.model.position.z))) return this._cancel(OFFER_HINT.cancelMoved);
        if (R.t >= OFFER.CHARGE) this._commit();
    }

    _unlock() {
        const R = this.run;
        if (!R) return;
        for (const b of R.bodies) { b.off = 0; if (b.animal) b.animal.offered = false; }
        for (const t of R.things) if (t.L) t.L.ritual = false;
    }

    _endRun(ok) {
        const R = this.run;
        if (!R) return;
        if (R.m) R.m.offerHell = 0;
        this.run = null;
        void ok;
    }

    _cancel(text) {
        const R = this.run;
        if (!R) return;
        this._unlock();
        this._cool = 4;
        if (!R.remote) {
            this.game.sync?.pentagram?.({ k: 'ofr', op: 'cancel', id: R.m?.id });
            this.game.hud?.setVoice?.(text, true);
        }
        this._endRun(false);
    }

    /** The last look, then the payment: gargoyles — the ritual itself pays and begins (it may still refuse); the monster — 200 mana, the circle is paid for. */
    _commit() {
        const R = this.run, g = this.game, m = R.m, need = OFFERINGS[m.offer], c = g.combat;
        const center = { x: m.x, y: m.y, z: m.z };
        if (m.offer === 'infernum' || m.offer === 'hellBack') {
            g.hellGate?.opened?.(m, true); // (the gates of hell open: HellGate.js — every computer by 'pgm' k 'hell')
        } else if (m.offer === 'gargoyles') {
            const r = g.gargoyles?.startRitual?.(center, { by: g.localId, silent: true });
            if (!r?.ok) return this._cancel(r?.why === 'mana' ? OFFER_HINT.cancelMana : (WHY[r?.why] || OFFER_HINT.cancelDead));
            m.life = Math.min(m.life, 6 + OFFER.BURN); // (the picture burns out after the ritual began, as it always did)
        } else {
            if (manaRules(g) && (c?.fatigue || 0) < need.mana) return this._cancel(OFFER_HINT.cancelMana);
            if (manaRules(g) && c) { c.fatigue -= need.mana; c._hudKey = ''; }
            m.prepaid = true; // (paid: PentagramMonster.stand → MonsterTransform.begin / BreakwardMark.activate take none)
            g.hud?.setVoice?.(m.offer === 'monster' ? '🐺 Рог и тело сгорают — встаньте в круг, и вы станете монстром' : '🜏 Тело сгорает — войдите в круг, и магическая защита будет сломана', true);
        }
        // the things are taken off: the horn goes in sparks, the bodies burn away (every computer plays it)
        for (const t of R.things) {
            const p = t.L.model.position;
            this._embers(p.x, p.y, p.z, 26);
            if ((t.item.count || 1) > 1) { t.item.count--; t.L.ritual = false; } else { g.items.removeLoose(t.uid); g.sync?.itemGone?.(t.uid, null, null); }
        }
        const ids = R.bodies.filter((b) => !b.animal).map((b) => b.id);
        for (const b of R.bodies) this._burnBody(b);
        g.sync?.pentagram?.({ k: 'ofr', op: 'burn', id: m.id, bodies: ids });
        this._endRun(true);
    }

    _embers(x, y, z, n) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < n; i++) fx.spark(_v.set(x + (Math.random() - 0.5) * 0.8, y + 0.2, z + (Math.random() - 0.5) * 0.8), i % 3 ? 0xff5a14 : 0xffb04a, 0.2, _d.set((Math.random() - 0.5) * 2.4, 2 + Math.random() * 3, (Math.random() - 0.5) * 2.4), 1.2);
    }

    // ------------------------------------------------------------ the bodies burn away (every computer)
    _burnBody(b) {
        if (!b || this.burns.some((x) => x.b === b)) return;
        b.off = 1;
        if (b.animal) { this._burnAnimal(b); return; }
        this.burns.push({ b, id: b.id, t: 0, x: b.x, y: b.y, z: b.z, scale0: b.model?.scale?.x || 1, y0: b.model?.position?.y ?? b.y });
    }

    /** An animal's carcass burns away (its own model; the herd's host removes it — Animals._remove). */
    _burnAnimal(b) {
        const o = b.animal.group;
        this.burns.push({ b: { id: b.id, model: o }, animal: b.animal, id: b.id, t: 0, x: b.x, y: b.y, z: b.z, scale0: o?.scale?.x || 1, y0: o?.position?.y ?? b.y });
    }

    _burnStep(dt) {
        const g = this.game, fx = g.fx;
        for (let i = this.burns.length - 1; i >= 0; i--) {
            const r = this.burns[i], o = r.b?.model;
            r.t += dt;
            const u = Math.min(1, r.t / OFFER.BURN);
            if (o) {
                const k = 1 - 0.85 * u * u;
                o.scale.setScalar(r.scale0 * (0.6 + 0.4 * k)); o.scale.y = r.scale0 * k; o.position.y = r.y0 - u * 0.5; o.rotation.z = Math.sin(r.t * 20) * 0.02 * (1 - u);
            }
            if (fx) {
                const n = Math.min(6, 2 + Math.floor(u * 5));
                for (let j = 0; j < n; j++) {
                    const hot = Math.random() < 0.6;
                    fx.spark(_v.set(r.x + (Math.random() - 0.5) * 2.4, r.y + 0.1 + Math.random() * 0.4, r.z + (Math.random() - 0.5) * 2.4), hot ? (Math.random() < 0.5 ? 0xff5a14 : 0xffb04a) : (Math.random() < 0.5 ? 0x2a2420 : 0x6a0a18), hot ? 0.34 : 0.26,
                        _d.set((Math.random() - 0.5) * 1.2, 2.2 + Math.random() * 3.2, (Math.random() - 0.5) * 1.2), 1 + Math.random());
                }
                if (u > 0.55 && Math.random() < 0.3) fx.spark(_v.set(r.x, r.y + 0.3, r.z), 0xd8d0bc, 0.2, _d.set((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), 1.6); // (ash)
            }
            if (r.t >= OFFER.BURN + 0.2) {
                if (r.animal) { if (g.animals?.list.includes(r.animal)) { if (g.animals.auth) g.animals._remove(r.animal); else if (r.animal.group) r.animal.group.visible = false; } }
                else if (g.death?.bodies.has(r.id)) g.death.removeBody(r.id, false);
                this.burns.splice(i, 1);
            }
        }
    }

    // ------------------------------------------------------------ network
    /** Another computer: the caster's rite gathers ('charge'), is cancelled ('cancel') or the bodies burn ('burn'). */
    onNet(by, m) {
        const mk = this.P?.marks.get(m.id);
        if (m.op === 'charge') {
            if (!mk || this.run) return;
            const at = (Array.isArray(m.at) ? m.at : []).slice(0, 8).map((p) => [+p[0] || 0, +p[1] || 0, +p[2] || 0]);
            this.run = { m: mk, bodies: [], things: [], at, t: 0, remote: true };
        } else if (m.op === 'cancel') {
            if (this.run?.remote) this._endRun(false);
        } else if (m.op === 'burn') {
            if (this.run?.remote) this._endRun(true);
            for (const id of (Array.isArray(m.bodies) ? m.bodies : []).slice(0, 8)) { const b = this.game.death?.bodies.get(String(id)); if (b) this._burnBody(b); }
        }
    }

    /** The world changes / death: nothing stays half-done. */
    clear() { this._unlock(); this.run = null; for (const r of this.burns) { if (this.game.death?.bodies.has(r.id)) this.game.death.removeBody(r.id, false); } this.burns.length = 0; }
}
