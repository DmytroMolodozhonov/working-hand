/**
 * PlayerPresence.js — who is in the world right now, and when the others may SEE them (чистые правила, без THREE и сети).
 *
 * Why: a guest still on the loading screen was drawn at the start place as soon as the first packet came, then «jumped» to the
 * place where he was last time; «Подключился» was shown before he could play. Now every other player goes through the steps
 *   «заходит…» (в списке, в мире его нет) → ready + look + pose всё получены → avatar made AT HIS REAL PLACE, one «подключился».
 * Packets may be lost / come in any order: the avatar appears at the last step, whichever it is, and never before all three are known.
 *
 * Notices («Игрок X подключился/отключился», «X умер») — the pure queue here; Hud.notify draws them (bottom left, ≤ 4 at once).
 * «Отключился» is held `LEAVE_HOLD` ms: a player who comes back with the same name inside it (a short lag, a reconnect) makes no noise.
 */

export const PRESENCE = {
    LEAVE_HOLD: 6500, // ms a «left» notice waits (5–8 s: not at a short lag)
    SHOW_MS: 5000, // ms a notice stays
    MAX_NOTICES: 4,
};

/** Shirt colours by the server's colour number (also the dot in Escape → «Игроки»). */
export const PLAYER_COLORS = [0xe67e22, 0x9b59b6, 0x1abc9c, 0xe74c3c, 0xf1c40f, 0x2ecc71, 0xecf0f1, 0x34495e];

const poseOk = (s) => !!s && typeof s === 'object' && s.s && Array.isArray(s.s.p) && s.s.p.length >= 3 && s.s.p.slice(0, 3).every(Number.isFinite);

export class PlayerPresence {
    constructor(opts = {}) {
        this.hold = opts.hold ?? PRESENCE.LEAVE_HOLD;
        /** id → { name, color, ready, look, pose, shown, left } */
        this.byId = new Map();
        this.pendingLeave = []; // { id, name, color, at }
        this.early = new Map(); // id → what came before the server's list did (a message may overtake the list)
        this.log = opts.log || null;
    }

    _note(t) { if (this.log) this.log(t); }

    /** The server's list of players (without me): new ones are «заходит…»; the missing ones left. Returns ids that left (were here). */
    setList(list, meId, now = 0) {
        const ids = new Set();
        for (const p of Array.isArray(list) ? list : []) {
            if (!p || p.id === meId || typeof p.id !== 'string') continue;
            ids.add(p.id);
            let e = this.byId.get(p.id);
            if (!e) {
                const pre = this.early.get(p.id);
                this.early.delete(p.id);
                e = { id: p.id, name: p.name || 'Игрок', color: p.color, ready: !!pre?.ready, look: !!pre?.look, pose: pre?.pose || null, shown: false };
                this.byId.set(p.id, e);
                this._note(`игрок ${e.name}: join (заходит, в мире его пока нет)`);
            } else { e.name = p.name || e.name; if (p.color != null) e.color = p.color; } // (a changed name)
        }
        const left = [];
        for (const id of [...this.byId.keys()]) if (!ids.has(id)) { this.leave(id, now); left.push(id); }
        return left;
    }

    /** `ready`: the player's game is open (the loading screen closed, he stands where he stood). */
    markReady(id) {
        const e = this.byId.get(id);
        if (!e) { this._early(id).ready = true; return false; }
        if (e.ready) return false;
        e.ready = true;
        this._note(`игрок ${e.name}: ready`);
        return true;
    }

    _early(id) {
        let x = this.early.get(id);
        if (!x) { if (this.early.size > 64) this.early.delete(this.early.keys().next().value); x = {}; this.early.set(id, x); }
        return x;
    }

    gotLook(id) { const e = this.byId.get(id); if (e) e.look = true; else this._early(id).look = true; }

    /** The newest pose (only the last is kept). A pose from somebody not ready is ignored altogether (older versions / lost `ready`). */
    gotPose(id, msg) {
        if (!poseOk(msg)) return;
        const e = this.byId.get(id);
        if (!e) { const x = this._early(id); if (x.ready) x.pose = msg; return; }
        if (!e.ready) return;
        e.pose = msg;
    }

    /** May the avatar be made now? — ready, look and a real pose all known, and not made yet. */
    canShow(id) {
        const e = this.byId.get(id);
        return !!e && !e.shown && e.ready && e.look && !!e.pose;
    }

    /** The avatar is made: `join` notice (or silence, if the same name just came back). Returns the entry. */
    shown(id, now = 0) {
        const e = this.byId.get(id);
        if (!e || e.shown) return null;
        e.shown = true;
        const p = e.pose?.s?.p;
        this._note(`игрок ${e.name}: появился в мире на ${p ? p.slice(0, 3).map((v) => Math.round(v)).join(', ') : '?'}`);
        const i = this.pendingLeave.findIndex((l) => l.name === e.name);
        if (i >= 0) { this.pendingLeave.splice(i, 1); this._note(`игрок ${e.name}: вернулся до конца ожидания — без уведомлений`); return { entry: e, notice: null }; }
        return { entry: e, notice: { kind: 'join', name: e.name, color: e.color } };
    }

    /** Gone. A player who was never shown (still loading) is never announced. */
    leave(id, now = 0, why = 'вышел') {
        const e = this.byId.get(id);
        if (!e) return null;
        this.byId.delete(id);
        this._note(`игрок ${e.name}: leave (${why}${e.shown ? '' : ', в мир так и не вошёл'})`);
        if (e.shown) this.pendingLeave.push({ id, name: e.name, color: e.color, at: now });
        return e;
    }

    /** Notices whose time has come (a «left» that nobody cancelled). */
    due(now) {
        const out = [];
        for (let i = this.pendingLeave.length - 1; i >= 0; i--) {
            const l = this.pendingLeave[i];
            if (now - l.at >= this.hold) { out.unshift({ kind: 'leave', name: l.name, color: l.color }); this.pendingLeave.splice(i, 1); }
        }
        return out;
    }

    /** For the Escape → «Игроки» tab: everyone but me, loading or not. */
    rows() {
        return [...this.byId.values()].map((e) => ({ id: e.id, name: e.name, color: e.color, loading: !e.shown }));
    }
}

/** A queue of what is on screen: newest at the bottom, at most `max`, each leaves after `ms`. */
export class NoticeQueue {
    constructor(max = PRESENCE.MAX_NOTICES, ms = PRESENCE.SHOW_MS) { this.max = max; this.ms = ms; this.items = []; }
    add(n, now = 0) { this.items.push({ ...n, at: now }); while (this.items.length > this.max) this.items.shift(); }
    live(now) { this.items = this.items.filter((n) => now - n.at < this.ms); return this.items; }
}

export const noticeText = (n) => (n.kind === 'join' ? `Игрок ${n.name} подключился` : n.kind === 'leave' ? `Игрок ${n.name} отключился` : n.kind === 'death' ? `${n.name} умер` : n.text || '');
