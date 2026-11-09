/** A host-confirmed interception; a guest reserves the price/shield until the reliable reply. */
import * as THREE from 'three';
import { CARDILON as C, cardilonCost, cardilonDelay, ordinaryShield, incomingBomb } from './CardilonRules.js';
import { CardilonLook } from '../fx/CardilonLook.js';
import { FX } from '../fx/WizardFx.js';
import { facesTarget, FACE } from './FaceTarget.js';
import { bombardoWayStop } from '../fx/SpellManager.js';

const _hand = new THREE.Vector3(), _center = new THREE.Vector3();
const validPoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
export class Cardilon {
    constructor(game) {
        this.game = game; this.look = new CardilonLook(game); this.pending = null; this.seq = 0; this.scan = 0;
        game.onDeath?.push(() => { this.pending = null; this.early = 0; });
    }
    _clear(a, b) {
        const g = this.game;
        if (g.spells.hooks.clearWay && !g.spells.hooks.clearWay(a, b)) return false;
        return !bombardoWayStop(g.collision, g.spells.hooks.doorsOnWay?.() || null, a, b);
    }
    _find(id) { for (const s of this.game.spells.spells) if (s.life > 0 && s.bomb?.id === id) return s; return null; }
    busy(v) {
        if (!v.cardilon || v.dead || v.noWand || v.sleep || v.stunT > 0 || v.lev || !(v.fx & FX.SHIELD)) return false;
        const s = this._find(v.cardilon.id);
        return !!s && incomingBomb(s.bomb, _center.set(v.x, v.y + 2.2, v.z));
    }
    _pick(center, hand, by) {
        let best = null, distance = Infinity;
        for (const s of this.game.spells.spells) {
            const b = s.bomb;
            if (!b || s.life <= 0 || b.by === by || !incomingBomb(b, center) || !this._clear(hand, b.p)) continue;
            const d = b.p.distanceToSquared(center);
            if (d < distance) { best = s; distance = d; }
        }
        return best;
    }
    cast(isFinal) {
        const now = performance.now();
        if (this.early && now - this.early < 3000) { if (isFinal) this.early = 0; return null; }
        if (this.pending) return null;
        const g = this.game, c = g.combat, shield = c.shield;
        const hint = (s) => { g.hud.setVoice(s, true); return null; };
        if (!ordinaryShield(shield)) return hint('🛡️ Для «Кардилон» сначала поднимите обычный «Protection»');
        c.center(_center); c.shieldAt(shield.side, _hand);
        const s = this._pick(_center, _hand, g.localId);
        if (!s) return hint('🛡️ Нет летящей к вам Бомбарды, которую можно перехватить');
        const extra = cardilonCost(s.bomb.power) - C.COST, tired = c.check('Cardilon', extra);
        if (tired) return hint(tired);
        const before = c.fatigue;
        c.pay('Cardilon', extra); c.shield = null;
        const m = { t: 'cdreq', id: s.bomb.id, rq: ++this.seq, h: _hand.toArray(), p: _center.toArray(), power: s.bomb.power };
        if (g.authority) {
            this._capture(s, g.localId, m);
            g.mana?.success?.('Cardilon');
        } else {
            this.pending = { ...m, shield, paid: Math.max(0, before - c.fatigue), at: performance.now() };
            g.sync?.net?.send(m);
        }
        this.early = isFinal ? 0 : now;
        return 'Cardilon';
    }
    _capture(s, by, request) {
        const to = s.bomb.p.toArray(), power = s.bomb.power;
        if (!s.capture()) return false;
        const m = { t: 'cdl', id: s.bomb.id, by, rq: request.rq, h: request.h, p: to, power };
        this._show(m);
        this.game.sync?.net?.send(m, true);
        return true;
    }
    _show(m) {
        const g = this.game;
        this.look.start(_hand.fromArray(m.h), _center.fromArray(m.p), m.power);
        if (m.by !== g.localId) {
            const r = g.remotes?.get(m.by);
            if (r?.combat) { r.combat.shield = 0; r.combat.shieldLeft = 0; }
        }
    }
    onNet(m) {
        const g = this.game, net = g.sync?.net;
        if (m.t === 'cdreq') {
            if (!g.authority || !net?.players.has(m.from) || typeof m.id !== 'string' || !validPoint(m.h) || !validPoint(m.p)) return;
            const s = this._find(m.id), r = g.remotes?.get(m.from);
            // Like other spell origins, these are the cast-time hand/body, not a potentially queued old pose.
            const hand = _hand.fromArray(m.h), center = _center.fromArray(m.p);
            const allowed = !r?.dead && s && s.bomb.by !== m.from && incomingBomb(s.bomb, center)
                && hand.distanceToSquared(center) < 36 && this._clear(hand, s.bomb.p);
            if (!allowed || !this._capture(s, m.from, m)) net.sendTo(m.from, { t: 'cdl', no: 1, rq: m.rq, id: m.id });
            return;
        }
        if (m.t !== 'cdl' || g.authority || m.from !== 'H') return;
        const mine = this.pending && m.by === g.localId && m.rq === this.pending.rq && m.id === this.pending.id;
        if (m.no) {
            const p = this.pending;
            if (!p || p.rq !== m.rq || p.id !== m.id) return;
            this.pending = null;
            if (g.combat.dead || g.isDeadLocal) return;
            g.combat.fatigue = Math.min(g.combat.maxFatigue, g.combat.fatigue + p.paid);
            p.shield.left -= (performance.now() - p.at) / 1000;
            if (!g.combat.shield && p.shield.left > 0 && !g.combat.stunned && !g.combat.frozen) g.combat.shield = p.shield;
            g.hud.setVoice('🛡️ Не успели перехватить Бомбарду', true);
            return;
        }
        if (!validPoint(m.h) || !validPoint(m.p)) return;
        const s = this._find(m.id);
        s?.capture();
        if (mine) { this.pending = null; g.mana?.success?.('Cardilon'); }
        // A late confirmation is visual only: it never creates a second blast or charges a new life.
        this._show(m);
    }
    _npc(v, s, dt) {
        const g = this.game, b = s.bomb, fight = g.castleLife?.wizards?.fight;
        _center.set(v.x, v.y + 2.2, v.z);
        if (!v.wizard || v.dead || v.noWand || v.sleep || v.stunT > 0 || v.lev || v.carriedBy || v.fx & FX.DOME || v.id === b.by || !incomingBomb(b, _center)) return;
        if (g.duel?.clashes?.some(c => c.a.by === v.id || c.b.by === v.id)) return;
        if (!g.castleLife._sees(v, b.p)) return;
        g.castleLife.wizards.blasts.protect(v);
        if (!(v.fx & FX.SHIELD) || v.fx & FX.DOME) return;
        let task = v.cardilon;
        if (!task || task.id !== b.id) {
            task = v.cardilon = { id: b.id, t: cardilonDelay(v) };
            v.prep = null; // Stop preparing an attack to speak the defensive word.
        }
        task.t -= dt;
        fight?._turnTo(v, b.p, dt);
        if (task.t > 0 || v.mana < cardilonCost(b.power) || !facesTarget(v.yaw, v.x, v.z, b.p.x, b.p.z, FACE.SPELL)) return;
        const hand = _hand.set(v.x - Math.sin(v.yaw) * 1.1, v.y + 2.7, v.z - Math.cos(v.yaw) * 1.1);
        if (!this._clear(hand, b.p)) return;
        if (this._capture(s, v.id, { h: hand.toArray() })) {
            v.mana -= cardilonCost(b.power); v.fx &= ~FX.SHIELD; v.shieldT = 0; v.cardilon = null;
            if (g.castleLife._isPlayer?.(b.by)) (v.castAtPlayers || (v.castAtPlayers = new Set())).add(b.by);
            v.castT = 0.5;
            g.castleLife._say(v, 'Кардилон!', 2);
            g.sound?.spellCast?.('Cardilon', hand); g.sync?.castSound?.('Cardilon', hand);
        }
    }
    update(dt) {
        this.look.update(dt);
        if (!this.game.authority) return;
        this.scan += dt;
        if (this.scan < 0.05) return;
        dt = this.scan; this.scan = 0;
        let active = false;
        for (const s of this.game.spells.spells) if (s.life > 0 && s.bomb) { active = true; break; }
        if (!active && !this.hadBomb) return;
        this.hadBomb = active;
        for (const v of this.game.castleLife?.byId.values() || []) {
            if (!active) { v.cardilon = null; continue; }
            if (!v.wizard || v.dead || v.noWand || v.sleep || v.stunT > 0 || v.fx & FX.DOME) { v.cardilon = null; continue; }
            _center.set(v.x, v.y + 2.2, v.z); _hand.set(v.x, v.y + 2.7, v.z);
            const s = this._pick(_center, _hand, v.id);
            if (s) this._npc(v, s, dt);
            else v.cardilon = null;
        }
    }
    dispose() { this.pending = null; this.look.dispose(); }
}
