/**
 * ShieldAlert.js — «чутьё опасности» для «Protection» скрещёнными руками (слова автора: «если какой-то игрок рядом, который,
 * может, даже палочку уже поднял, или сказал заклинание, или заклинание летит, то если человек пытается поднимать руки —
 * с большей вероятностью щит ему понадобится, чем если вообще никого нет рядом»).
 *
 *   Тревога 0…1 (`level`) — сколько игра «верит», что щит сейчас нужен. Источники (`ALERT_SOURCES`, самый сильный решает):
 *     - чужой заряд (дуэльные заклинания игроков и волшебников — `Duel.bolts`) летит, ближе 70 м и идёт на меня (мимо в
 *       пределах 6 м) — 1;
 *     - дуэль / арена идёт со мной — 0,8;
 *     - другой игрок ближе 45 м только что колдовал (≤ 2,5 с, `noteCast`: звук каста `csnd`, заряд `dcast`) — 0,8;
 *     - другой игрок ближе 45 м поднял руку и она смотрит на меня (≤ 25°) — 0,7;
 *     - волшебник / житель, воюющий со мной (`foe` — я), ближе 50 м — 0,7.
 *   Когда тревога ≥ `CrossTrack` ALERT_ON (0,5), жест подтверждается по ОДНОМУ кадру и угадывается раньше (CrossedArms.CROSS.ALERT);
 *   никого нет — правила прежние, строгие (ложных 0). Считается не чаще 10 раз в секунду, без мусора.
 */
import * as THREE from 'three';

export const ALERT = {
    EVERY: 0.1, // s between the readings
    BOLT_R: 70, BOLT_MISS: 6, // a charge this near, passing this close
    CAST_R: 45, CAST_T: 2.5, // a player who has just cast, this near, this recently
    AIM_R: 45, AIM_COS: Math.cos(25 * Math.PI / 180), // a raised hand aimed at me
    FOE_R: 50,
};

/** Who/what raises the alert, how much (the table the author's words make). */
export const ALERT_SOURCES = {
    bolt: { k: 1, why: 'летит заряд' },
    duel: { k: 0.8, why: 'дуэль' },
    cast: { k: 0.8, why: 'рядом только что колдовали' },
    aim: { k: 0.7, why: 'на вас наведена рука' },
    foe: { k: 0.7, why: 'рядом враг' },
};

const _me = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3();

export class ShieldAlert {
    constructor(game) {
        this.game = game;
        this.level = 0; this.why = '';
        this._t = 0;
        this.casts = new Map(); // player id → { at (s, performance clock), x, y, z }
    }

    /** Someone else cast (the network's cast sound / a duel charge): remembered a moment. */
    noteCast(by, p) {
        if (!by || by === this.game.localId) return;
        let c = this.casts.get(by);
        if (!c) { if (this.casts.size > 32) this.casts.clear(); c = {}; this.casts.set(by, c); }
        c.at = performance.now() / 1000;
        if (p) { c.x = p.x ?? p[0]; c.y = p.y ?? p[1]; c.z = p.z ?? p[2]; } else c.x = null;
    }

    update(dt) {
        this._t -= dt;
        if (this._t > 0) return;
        this._t = ALERT.EVERY;
        this._read();
    }

    _set(src) { const s = ALERT_SOURCES[src]; if (s.k > this.level) { this.level = s.k; this.why = s.why; } }

    _read() {
        const g = this.game, ch = g.character;
        this.level = 0; this.why = '';
        if (!ch?.group) return;
        _me.copy(ch.group.position);
        const me = g.localId;
        // charges flying at me (anyone's but mine: players, wizards)
        const bolts = g.duel?.bolts;
        if (bolts) for (const b of bolts.values()) {
            if (b.state !== 'flying' || b.by === me || b.by === 'local' || !b.front) continue;
            _d.subVectors(_me, b.front);
            const dist = _d.length();
            if (dist > ALERT.BOLT_R) continue;
            const along = _d.dot(b.dir);
            if (along < -1) continue; // (gone past me)
            const miss = Math.sqrt(Math.max(0, dist * dist - along * along));
            if (miss <= ALERT.BOLT_MISS || (b.tk === 'p' && b.tid === me)) { this._set('bolt'); break; }
        }
        if (this.level >= 1) return;
        if (g._inDuel?.() || g.arenaDuels?.mode) this._set('duel');
        // other players: cast a moment ago / a raised hand aimed at me
        const now = performance.now() / 1000;
        for (const [id, c] of this.casts) {
            if (now - c.at > ALERT.CAST_T) { this.casts.delete(id); continue; }
            const r = g.remotes?.get(id);
            const p = r?.character?.group?.position;
            const far = p ? p.distanceTo(_me) : c.x != null ? Math.sqrt((c.x - _me.x) ** 2 + (c.y - _me.y) ** 2 + (c.z - _me.z) ** 2) : 0;
            if (far <= ALERT.CAST_R) this._set('cast');
        }
        if (g.remotes) for (const r of g.remotes.values()) {
            const rc = r.character;
            if (!rc?.group || r.dead) continue;
            if (rc.group.position.distanceTo(_me) > ALERT.AIM_R) continue;
            for (let i = 0; i < 2; i++) {
                const side = i ? 'right' : 'left';
                try {
                    if (!rc.isArmRaised(side)) continue;
                    rc.getHandWorldPosition(side, _h);
                    rc.getHandDirection(side, _d);
                    const to = _h.sub(_me).negate(); // (hand → me)
                    const l = to.length();
                    if (l > 1e-3 && to.dot(_d) / l >= ALERT.AIM_COS) { this._set('aim'); break; }
                } catch (e) { /* (a body not ready yet) */ }
            }
        }
        // wizards / villagers at war with me, near
        const L = g.castleLife;
        if (L?.byId && this.level < ALERT_SOURCES.foe.k) for (const v of L.byId.values()) {
            if (v.dead || (v.foe !== me && v.foe !== 'local')) continue;
            if (!Number.isFinite(v.x)) continue;
            const dx = v.x - _me.x, dz = v.z - _me.z;
            if (dx * dx + dz * dz <= ALERT.FOE_R * ALERT.FOE_R) { this._set('foe'); break; }
        }
    }
}
