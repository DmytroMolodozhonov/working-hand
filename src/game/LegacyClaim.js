/** A slow guest must receive the host's decision before restoring an old life. */
import { LEGACY } from './Legacy.js';
import { SEALED_WHY } from './SoulSealRules.js';

export class LegacyClaim {
    constructor(death) { this.death = death; this.pending = null; this.seq = 0; }
    get game() { return this.death.game; }

    request(b) {
        if (this.pending && !this.death.bodies.has(this.pending.id)) this.pending = null;
        if (this.pending && performance.now() - this.pending.at < 30000) return;
        this.pending = { id: b.id, rq: ++this.seq, at: performance.now() };
        const p = this.game.character?.group?.position;
        this.game.sync?.net?.send({ t: 'dlreq', id: b.id, rq: this.seq, p: p ? [p.x, p.y, p.z] : undefined });
        this.game.hud?.setVoice?.('💫 Вы тянетесь к силе прежней жизни…', true);
    }

    cancel() {
        if (this.pending) this.game.sync?.net?.send({ t: 'dlreq', id: this.pending.id, rq: this.pending.rq, cancel: 1 });
        this.pending = null;
    }

    leave(id) { for (const b of this.death.bodies.values()) if (b.claim?.by === id) delete b.claim; }

    host(m) {
        const g = this.game, b = this.death.bodies.get(m.id), net = g.sync?.net || g.net;
        if (!net?.isHost || !b) return;
        if (m.cancel) { if (b.claim?.by === m.from && b.claim.rq === m.rq) delete b.claim; return; }
        const owner = net.players.get(m.from)?.pid || m.from;
        // Like a spell origin: the command carries its cast-time position, even if a pose is queued on a slow link.
        const p = Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite) ? { x: m.p[0], y: m.p[1], z: m.p[2] } : g.remotes?.get(m.from)?.position;
        const ok = b.lg?.owner === owner && !b.seal && p && Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) <= LEGACY.RANGE + (b.len || 3) * 0.5;
        if (ok) b.claim = { by: m.from, rq: m.rq, until: Date.now() + 60000 };
        net.sendTo(m.from, { t: 'dlack', id: b.id, rq: m.rq, ok: !!ok, ...(ok ? { lg: b.lg } : { seal: b.seal || null }) });
    }

    reply(m) {
        const g = this.game, pending = this.pending;
        if (m.from !== 'H' || !pending || pending.id !== m.id || pending.rq !== m.rq) return;
        this.pending = null;
        const b = this.death.bodies.get(m.id);
        if (!b) return;
        if (!m.ok) {
            if (m.seal) this.death.sealBody(b, m.seal);
            g.hud?.setVoice?.(m.seal ? SEALED_WHY : 'Сила больше недоступна: подойдите к своему телу и попробуйте снова.', true);
            return;
        }
        b.lg = m.lg;
        if (!g._finishGiveMyPower?.(b, true)) g.sync?.net?.send({ t: 'dlreq', id: b.id, rq: m.rq, cancel: 1 });
    }

    clear(id, by) {
        const b = this.death.bodies.get(id), g = this.game, net = g.sync?.net || g.net;
        if (!b?.lg || b.seal) return false;
        if (net?.isHost && by && by !== 'H') {
            const owner = net.players.get(by)?.pid || by;
            if (b.lg.owner !== owner || b.claim?.by !== by || b.claim.until < Date.now()) return false;
        }
        delete b.claim;
        return true;
    }
}
