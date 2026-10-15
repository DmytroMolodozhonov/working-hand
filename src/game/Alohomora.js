/**
 * Alohomora.js — «Алохомора» (5 маны) and «Алохомора Максима» (25): locks.
 *
 * Point the hand (or the wand in it) at a lock a few metres away and say the word:
 *  - a locked chest of a village or a castle: a click, a little light, the lid springs up
 *    a crack — the hand lifts it the rest of the way (Chest.liftTo; nobody's chest opens
 *    by just walking up to it any more);
 *  - a locked door of a villager's house: it unlocks and swings open a crack — the hand
 *    takes the handle and opens it (Doors.js);
 *  - the gates of a throne room: too strong for the plain word — only «Максима» (or a
 *    blast) opens them for a stranger; the castle's own people pass through freely.
 * Whoever of the village sees the lock forced (and later the things taken) goes for the
 * thief: the family of the house, the castle's guards for the castle's chests and gates.
 *
 * Which doors are locked (the host decides, everybody sees the same): about half the houses
 * of a village lock their door — at night, or while nobody of the family is at home. By day
 * with the family in, the door is open to a visitor. A door a player built is never locked.
 *
 * «Lock» (3 маны, no scroll, instant — no concentration): the opposite word. Point at a door and say
 * «Lock»: an open leaf swings shut by itself (it stops on a body in its way and goes on when it is
 * clear), the lock clicks with a little light. Till somebody says «Алохомора» at it, nobody opens it:
 * not the hand (it only rattles), not the family of the house, the knights, the wizards, the animals,
 * the other players — the people who come to it knock, wait and go another way. It is a plain lock, not a
 * ward: a blast, a blade, fire break the door as any other (Wreck.js). LOCK_TARGETS below.
 *
 * ON WHOM AND ON WHAT IT ACTS (CLAUDE.md «На кого и на что») — TARGETS below, in code:
 * multiplayer: whoever casts unlocks it on their computer and tells everybody ('lock', relayed);
 * the host also judges the witnesses; the unlocked locks, the gates' state and the doors the
 * host locked go with the world's save and to a player who joins.
 */

import * as THREE from 'three';
import { CHEST_W, LID_LEN } from '../entities/Chest.js';

export const ALOHOMORA = {
    RANGE: 5.5, // m from the hand to the lock
    CONE: 0.5, // rad round the pointing hand (a lock right by the hand: more, see _pick)
    GATE_HITS: 2, // blasts to break the gates: «Бомбардо» counts 1, «Бомбардо Максима» 3, «Total Destruction» breaks them at once
    LOCK_SHARE: 0.55, // of the houses of a village lock their doors (at night / nobody home)
    WIZ_LOCK_SHARE: 0.85, // of the wizards' houses lock their doors (at night; most of them by day too)
    NEAR: 70, // m: the gates of a castle this near are put up
};

/**
 * Who and what «Алохомора» / «Алохомора Максима» acts on (and why not). `plain` / `maxima`:
 * what each word does to it.
 */
export const TARGETS = {
    // ---- things with locks
    settlementChest: { plain: 'unlock', maxima: 'unlock', why: 'сундуки замков, деревень, домов жителей, порта — заперты; открыть их — кража, если кто-то видит' },
    caveChest: { plain: 'none', maxima: 'none', why: 'сундуки пещер, тестовый сундук и пьедесталы не заперты: открываются, когда подходишь' },
    cartChest: { plain: 'unlock', maxima: 'unlock', why: 'сундук в повозке путников (волшебников или людей) заперт; взломать его при них — нападение: волшебники защищают сундук, люди убегают (Travelers.js)' },
    shipChest: { plain: 'none', maxima: 'none', why: 'сундуки кораблей не заперты: их стережёт команда (Ships.lootChest)' },
    towerChest: { plain: 'none', maxima: 'none', why: 'сундуки академии волшебников заперты чарами Мастера — пока не открыть (позже), откроются, когда он падёт' },
    villagerDoor: { plain: 'unlock', maxima: 'unlock', why: 'дверь дома жителя: заперта ночью или когда никого нет дома; открывается щелью, дальше — рукой' },
    castleDoor: { plain: 'none', maxima: 'none', why: 'двери внутри замка без замков (открываются рукой)' },
    throneGate: { plain: 'refuse', maxima: 'unlock', why: 'ворота тронного зала: слишком сильный замок для простой «Алохоморы»; ломаются и взрывом' },
    playerDoor: { plain: 'none', maxima: 'none', why: 'дверь, поставленная игроком, не запирается' },
    wizardDoor: { plain: 'unlock', maxima: 'unlock', why: 'двери домов волшебников почти всегда заперты (и днём); большая дверь академии — на ночь; открывается щелью, дальше — рукой' },
    shipHatch: { plain: 'none', maxima: 'none', why: 'на кораблях дверей с замками нет' },
    // ---- the living: no lock in them, nothing to open (it doesn't push, hurt or hold anybody)
    players: { plain: 'none', maxima: 'none', why: 'на игроков (меня и других по сети) не действует: в человеке нет замка' },
    zombies: { plain: 'none', maxima: 'none', why: 'не действует на зомби: нечего отпирать' },
    castlePeople: { plain: 'none', maxima: 'none', why: 'жители, рыцари, король, волшебники, торговцы, слуги — не действует (но видят, как вы взламываете)' },
    animals: { plain: 'none', maxima: 'none', why: 'животные — не действует' },
    sailors: { plain: 'none', maxima: 'none', why: 'моряки (ships.crew) — не действует' },
    spider: { plain: 'none', maxima: 'none', why: 'гигантский паук — не действует' },
    dragon: { plain: 'none', maxima: 'none', why: 'дракон — отпирать нечего, не действует' },
    iceCastle: { plain: 'none', maxima: 'none', why: 'Ледяная Королева, снеговики, ледяные монстры — отпирать нечего, не действует (ледяные ворота не заперты: их держат монстры)' },
    blackship: { plain: 'none', maxima: 'none', why: 'капитан Чёрные Усы и его скелеты — отпирать нечего; сундуки чёрного корабля не заперты, кроме сундука капитана: он открывается, когда капитан убит (Ships._placeChests)' },
    phoenix: { plain: 'none', maxima: 'none', why: 'феникс — живая птица без замков, не действует' },
    livingTrees: { plain: 'none', maxima: 'none', why: 'ожившие деревья — не действует' },
    bookBirds: { plain: 'none', maxima: 'none', why: 'книги-птицы — не действует (книга не заперта)' },
    // ---- the world
    world: { plain: 'none', maxima: 'none', why: 'земля, вода, деревья, стены, корабли, оружие и вещи — не действует' },
};

/**
 * Who and what «Lock» acts on (and why not). `does`: 'lock' — shut and locked; 'none' — not touched.
 */
export const LOCK_TARGETS = {
    villagerDoor: { does: 'lock', why: 'дверь дома жителя: закрывается и запирается; хозяева тоже не войдут, пока не скажут «Алохомора»' },
    wizardDoor: { does: 'lock', why: 'дверь дома волшебника, большая дверь академии — запирается так же' },
    playerDoor: { does: 'lock', why: 'дверь, поставленная игроком («Create a Door»), — запирается так же' },
    throneGate: { does: 'lock', why: 'ворота тронного зала: обе створки закрываются и запираются — и для своих рыцарей и слуг' },
    castleDoor: { does: 'none', why: 'дверей внутри замка как предметов нет (проходы) — запирать нечего' },
    shipHatch: { does: 'none', why: 'на кораблях дверей нет, только проёмы' },
    chests: { does: 'none', why: 'сундуки — не двери: «Lock» их не трогает (запертые и так заперты)' },
    players: { does: 'none', why: 'на игроков (меня и других по сети) не действует: запирает только двери' },
    zombies: { does: 'none', why: 'на зомби не действует' },
    castlePeople: { does: 'none', why: 'жители, рыцари, король, волшебники, торговцы, слуги — не действует; к запертой двери они стучат, ждут и идут другой дорогой' },
    animals: { does: 'none', why: 'животные — не действует (двери они и так не открывают)' },
    sailors: { does: 'none', why: 'моряки (ships.crew) — не действует' },
    spider: { does: 'none', why: 'гигантский паук — не действует' },
    dragon: { does: 'none', why: 'дракон — не действует' },
    iceCastle: { does: 'none', why: 'ледяные существа — не действует' },
    blackship: { does: 'none', why: 'капитан Чёрные Усы и скелеты — не действует' },
    phoenix: { does: 'none', why: 'феникс — не действует' },
    livingTrees: { does: 'none', why: 'ожившие деревья — не действует' },
    bookBirds: { does: 'none', why: 'книги-птицы — не действует' },
    world: { does: 'none', why: 'земля, вода, деревья, стены, корабли, оружие и вещи — не действует. Это не магическая защита: дверь ломается взрывом, оружием, огнём как обычная' },
};

/**
 * «Lock» in what the recognizer heard: only the whole phrase («Lock», «Лок», «Lock door», «Лок дор»,
 * «Lock the door») — never a word inside talk («блок», «локоть», «лок» in a sentence).
 */
const LOCK_W = new Set(['lock', 'locke', 'lok', 'loc', 'locks', 'лок', 'локк', 'лока', 'лак']);
const LOCK_ART = new Set(['the', 'a', 'зе', 'за', 'зэ', 'дзе', 'э', 'ze', 'де']);
const LOCK_DOOR = new Set(['door', 'dor', 'doors', 'дор', 'доор', 'дорь', 'двер', 'дверь', 'дверку', 'дверь']);
export function isLockWord(text) {
    const w = String(text || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/).filter(Boolean);
    if (!w.length || w.length > 4 || !LOCK_W.has(w[0])) return false;
    if (w[0] === 'лак' && w.length === 1) return false; // («лак» alone: varnish — only «лак дор»)
    let i = 1;
    while (i < w.length && LOCK_W.has(w[i])) i++; // («лок лок»)
    if (i < w.length && LOCK_ART.has(w[i])) i++;
    if (i < w.length && LOCK_DOOR.has(w[i])) i++;
    return i === w.length && (w[0] !== 'лак' || LOCK_DOOR.has(w[w.length - 1]));
}

/** The kind of a chest for TARGETS. */
export function chestKind(c) {
    if (!c) return null;
    if (c.ship) return 'shipChest';
    if (c.cart) return 'cartChest';
    if (c.castle?.kind === 'tower' || c.house?.def?.kind === 'tower') return 'towerChest';
    if (c.house || c.castle) return 'settlementChest';
    return 'caveChest';
}

/** The kind of a door for TARGETS. */
export function doorKind(d) {
    if (!d) return null;
    if (d.gate) return 'throneGate';
    if (!d.gen) return 'playerDoor';
    if (d.tower) return 'wizardDoor';
    return 'villagerDoor';
}

/**
 * «Алохомора» in what the recognizer heard: 0 — no, 1 — «Алохомора», 2 — «Алохомора Максима».
 * The heart of the word «…хомор…» / «…хамор…» (with «ло» / «ла» before it, or on its own as the
 * beginning of a word) — as a word of its own, or two neighbouring words written apart
 * («алло хомора»). Talk never casts it: «Аллах», «хомяк», «хамон», «мора» alone are no spell.
 */
const ALO_RU = /^(?:[аоэ]?л+[аоыэ]?)?х[оа]м[оа]р[аыуеоя]?$/;
const ALO_EN = /^(?:a?l+[oa])?h[oa]m[oa]r[ae]?$/;
const MAX_W = /^(?:макс|max|maks|мах|мэкс|мекс)/;
export function alohomoraWords(text) {
    const w = String(text || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/).filter(Boolean);
    let at = -1;
    for (let i = 0; i < w.length && at < 0; i++) {
        const one = w[i], two = i + 1 < w.length ? w[i] + w[i + 1] : '';
        const ok = (x) => (ALO_RU.test(x) || ALO_EN.test(x)) && /[хh]/.test(x) && (x.length >= 6 || /^[хh]/.test(x));
        if (ok(one)) at = i;
        else if (two && /[lл]/.test(w[i]) && ok(two)) at = i; // («алло хомора», «лохо мора»)
    }
    if (at < 0) return 0;
    return w.slice(at + 1).some((x) => MAX_W.test(x)) ? 2 : 1;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _h = {};

export class Alohomora {
    constructor(game) {
        this.game = game;
        this.chests = new Set(); // chest ids unlocked by the spell
        this.picked = new Set(); // house door ids unlocked by the spell
        this.doorLocks = new Map(); // (from the host) house door id → locked now
        this.gates = new Map(); // castle id → {unlocked, broken, hits}
        this.gateRecs = new Map(); // castle id → {def, ids: [left, right], auto, openT}
        this._scanT = 0;
        this._lockT = 0;
        this._hintT = 0;
        this.lift = { left: null, right: null }; // the chest whose lid each hand lifts
        this.spelled = new Set(); // door ids locked by «Lock» (till «Алохомора»)
        this.closing = new Set(); // … of them, the leaves still swinging shut
    }

    get auth() { return this.game.authority; }

    // ---------------------------------------------------------------- the rules
    /** Is this door locked for me (the hand on its handle)? */
    doorLocked(d) {
        if (!d) return false;
        if (this.spelled.has(d.id)) return true; // («Lock»: for everybody, the castle's owner too)
        if (d.gate) {
            const st = this.gates.get(d.castle) || {};
            if (st.unlocked || st.broken) return false;
            const owner = this.game.castleLife?.state?.(d.castle)?.owner;
            return !(owner && owner === this.game.localId); // (the castle is mine: its gates open to me)
        }
        if (!d.gen) return false;
        return !!this.doorLocks.get(d.id) && !this.picked.has(d.id);
    }

    /** A house's door locks (the host): some houses do, at night or with nobody of the family at home. */
    _houseLocked(rec) {
        const g = this.game;
        if (rec.def?.kind === 'tower') {
            if (rec.h.kind === 'tower') return !!g.isNight; // (the academy's great door: locked for the night)
            if (hash01(rec.h.id) >= ALOHOMORA.WIZ_LOCK_SHARE) return false;
            if (g.isNight || hash01(rec.h.id + 'd') < 0.6) return true; // (a wizard locks his door — most even when at home)
        } else if (hash01(rec.h.id) >= ALOHOMORA.LOCK_SHARE) return false;
        if (g.isNight) return true;
        const home = [...(g.castleLife?.byId?.values() || [])].some((v) => !v.dead && v.cs?.def === rec.def && v.job === 'home' && v.house === rec.i);
        return !home;
    }

    /** The hand tried a locked door: rattling, a hint now and then. */
    lockedTried(d) {
        const now = performance.now();
        if (now - this._hintT < 3500) return;
        this._hintT = now;
        if (this.spelled.has(d.id)) { this.game.hud?.setVoice('🔒 Дверь заперта заклинанием «Lock» — откройте её «Алохоморой»', true); return; }
        this.game.hud?.setVoice(d.gate ? '🔒 Ворота тронного зала заперты. Простая «Алохомора» их не возьмёт — нужна «Алохомора Максима» (или взрыв)' : '🔒 Заперто — скажите «Алохомора», показав рукой на замок', true);
    }

    // ---------------------------------------------------------------- the spell
    /** Cast (Game.handleVoice): the lock the hand points at. Returns the spell's name when it worked. */
    cast(name, isFinal) {
        const g = this.game;
        const maxima = name === 'AlohomoraMaxima';
        if (!isFinal && !maxima) return null; // (wait: the end of the phrase may be «…Максима»)
        const now = performance.now();
        if (now - (this._castAt || -1e9) < (isFinal && this._interim ? 3000 : 900)) { this._interim = false; return null; }
        const t = this._pick();
        if (!t) { if (isFinal) g.hud.setVoice('🗝️ Покажите рукой на замок (сундук, дверь, ворота) рядом — до 5 м — и скажите «Алохомора»', true); return null; }
        const kind = t.chest ? chestKind(t.chest) : doorKind(t.door);
        // a door shut by «Lock»: any «Алохомора» takes that lock off (the door's own lock, if it has one, too — the plain word permitting)
        const spelled = t.door && this._leaves(t.door).filter((d) => this.spelled.has(d.id));
        if (spelled?.length) {
            const tired = g.combat.check(name);
            if (tired) { g.hud.setVoice(tired, true); return null; }
            g.combat.pay(name);
            g.mana?.success(name);
            this._castAt = now;
            this._interim = !isFinal;
            const m = { k: 'unlock', ids: spelled.map((d) => d.id), by: g.localId };
            for (const id of m.ids) this.spelled.delete(id); // (decide below on the door's own lock)
            const own = TARGETS[kind]?.[maxima ? 'maxima' : 'plain'] === 'unlock' && this._isLocked(t);
            if (own) m.own = t.door.gate ? { k: 'gate', id: t.door.castle } : { k: 'door', id: t.door.id };
            this.apply(m, true);
            g.sync?.net?.send({ t: 'lock', ...m }, true);
            return name;
        }
        const rule = TARGETS[kind]?.[maxima ? 'maxima' : 'plain'];
        if (rule === 'refuse') { if (isFinal) g.hud.setVoice('🔒 Слишком сильный замок — нужна «Алохомора Максима»', true); return null; }
        if (rule !== 'unlock' || !this._isLocked(t)) {
            if (isFinal) g.hud.setVoice(kind === 'towerChest' ? '🔮 Сундук академии заперт чарами Мастера — «Алохомора» тут бессильна' : t.chest ? '🔓 Этот сундук не заперт' : '🔓 Не заперто — возьмитесь за ручку', true);
            return null;
        }
        const tired = g.combat.check(name);
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay(name);
        g.mana?.success(name);
        this._castAt = now;
        this._interim = !isFinal;
        const msg = t.chest ? { k: 'chest', id: t.chest.id } : t.door.gate ? { k: 'gate', id: t.door.castle } : { k: 'door', id: t.door.id };
        this.apply({ ...msg, by: g.localId }, true);
        g.sync?.net?.send({ t: 'lock', ...msg, by: g.localId }, true);
        return name;
    }

    /** Both leaves of the gates (one door otherwise). */
    _leaves(d) {
        if (!d.gate) return [d];
        const ids = this.gateRecs.get(d.castle)?.ids || [d.id];
        return ids.map((id) => this.game.doors?.list.get(id)).filter(Boolean);
    }

    // ---------------------------------------------------------------- «Lock»
    /** «Lock» (Game.handleVoice): the door the hand points at shuts and locks. Instant (no concentration). */
    castLock(isFinal) {
        const g = this.game;
        if (!isFinal) return null; // (a short word: the whole phrase only)
        const now = performance.now();
        if (now - (this._lockAt || -1e9) < 900) return null;
        const t = this._pick(true);
        if (!t) { g.hud.setVoice('🔒 Покажите рукой (палочкой) на дверь рядом — до 5 м — и скажите «Lock»', true); return null; }
        const leaves = this._leaves(t.door).filter((d) => !d.lifted);
        if (!leaves.length) return null;
        if (leaves.every((d) => this.spelled.has(d.id))) { g.hud.setVoice('🔒 Эта дверь уже заперта', true); return null; }
        const tired = g.combat.check('Lock');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Lock');
        g.mana?.success('Lock');
        this._lockAt = now;
        const m = { k: 'shut', ids: leaves.map((d) => d.id), by: g.localId };
        this.apply(m, true);
        g.sync?.net?.send({ t: 'lock', ...m }, true);
        return 'Lock';
    }

    /** A door shut by «Lock» standing closed in the way at (x, z) (feet at y): nobody walks through it. */
    blocksAt(x, z, y, pad = 0.35) {
        if (!this.spelled.size) return false;
        const D = this.game.doors;
        for (const id of this.spelled) {
            const d = D?.list.get(id);
            if (!d || d.lifted || Math.abs(d.a) >= 0.35) continue;
            if (y != null && (y < d.y - 1.5 || y > d.y + (d.h || 3.6))) continue;
            const w = (d.w || 1.6) / 2 + pad;
            const c = Math.cos(d.ry), s = Math.sin(d.ry), dx = x - d.x, dz = z - d.z;
            const along = dx * c - dz * s, across = dx * s + dz * c; // (the leaf's own axes: along it / through it)
            if (Math.abs(along) < w && Math.abs(across) < 0.1 + pad) return true;
        }
        return false;
    }

    /** Is this door shut by «Lock» (the people of the house don't open it)? */
    spellLocked(id) { return this.spelled.has(id); }

    /** The leaves still swinging shut after «Lock»: on, round their hinges, stopping on a body in the way. */
    _closeLeaves(dt) {
        const D = this.game.doors;
        for (const id of [...this.closing]) {
            const d = D?.list.get(id);
            if (!d || !this.spelled.has(id) || d.lifted) { this.closing.delete(id); continue; }
            if (d.holdSide) continue; // (a hand on the handle: the leaf waits for it to let go)
            const sg = Math.sign(d.a); // (it swings shut from whichever side it is open to)
            let a = sg * Math.max(0, Math.abs(d.a) - dt * 1.6);
            const stop = D._bodyInSwing ? D._bodyInSwing(d, d.a, a) : null;
            if (stop != null) a = sg > 0 ? Math.max(a, Math.min(d.a, stop)) : Math.min(a, Math.max(d.a, stop)); // (somebody in the doorway: it waits)
            D._setAngle(d, a);
            if (a === 0) {
                this.closing.delete(id);
                this._clicked(d);
            }
        }
    }

    /** The lock clicks shut: a sound, a little light at the handle. */
    _clicked(d) {
        const g = this.game;
        g.sound?.playClang?.(0.22);
        this._flash(d.model?.userData?.knob?.getWorldPosition(new THREE.Vector3()), false, 0xb8d8ff);
        if (g.authority) g.sync?.doorAngle?.(d.id, 0);
    }

    _isLocked(t) {
        if (t.chest) return t.chest.locked && !t.chest.picked && !t.chest.isOpen;
        return this.doorLocked(t.door);
    }

    /** The lock the hand (or the wand) points at: chests, doors, gates within reach. */
    _pick(doorsOnly = false) {
        const g = this.game, ch = g.character;
        const sides = [g.wandSide?.(), 'right', 'left'].filter((s, i, a) => s && a.indexOf(s) === i);
        let best = null;
        for (const side of sides) {
            const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
            const dir = ch.getHandDirection(side, new THREE.Vector3());
            const look = (p, target) => {
                const to = _v.subVectors(p, hand);
                const d = to.length();
                if (d > ALOHOMORA.RANGE) return;
                const ang = d < 0.05 ? 0 : dir.angleTo(to.normalize());
                if (ang > ALOHOMORA.CONE + Math.atan2(0.8, d)) return;
                const score = ang * 4 + d * 0.1;
                if (!best || score < best.score) best = { ...target, score, side };
            };
            for (const c of doorsOnly ? [] : g.chests || []) {
                if (c.isOpen) continue;
                const p = c.getPosition();
                if (Math.abs(p.x - hand.x) + Math.abs(p.z - hand.z) > 10) continue;
                look(c.lidEdge ? c.lidEdge(_v2) : _v2.copy(p), { chest: c });
            }
            for (const d of g.doors?.list.values() || []) {
                if (d.lifted || Math.abs(d.x - hand.x) + Math.abs(d.z - hand.z) > 12) continue;
                // the lock: by the handle (a gate: in the middle, where its leaves meet)
                const k = d.model.userData.knob.getWorldPosition(_v2);
                look(k, { door: d });
            }
            if (best) break; // (the wand's hand / the right hand first)
        }
        return best;
    }

    /** Unlock (on every computer); `mine`: I cast it. The host judges who saw it. */
    apply(m, mine = false) {
        const g = this.game;
        if (m.k === 'chest') {
            this.chests.add(m.id);
            const c = g.chests?.find((x) => x.id === m.id);
            if (c) { c.setAjar(); this._flash(c.lidEdge(new THREE.Vector3())); }
            if (this.auth && c && m.by) this._witness(c, m.by);
        } else if (m.k === 'door') {
            this.picked.add(m.id);
            const d = g.doors?.list.get(m.id);
            if (d) { if (Math.abs(d.a) < 0.2) g.doors._setAngle(d, 0.2 * (Math.sign(d.a) || 1)); this._flash(d.model.userData.knob.getWorldPosition(new THREE.Vector3())); }
            if (this.auth && d && m.by) this._witnessDoor(d, m.by);
        } else if (m.k === 'gate') {
            const st = this._gate(m.id);
            st.unlocked = true;
            const rec = this.gateRecs.get(m.id);
            for (const id of rec?.ids || []) { const d = g.doors?.list.get(id); if (d) { if (Math.abs(d.a) < 0.2) g.doors._setAngle(d, 0.2 * (Math.sign(d.a) || 1)); } }
            const d0 = rec && g.doors?.list.get(rec.ids[0]);
            if (d0) this._flash(_v.set(rec.def.throneGate.x, d0.y + 3.2, rec.def.throneGate.z), true);
            if (this.auth && m.by) this._witnessGate(m.id, m.by);
        } else if (m.k === 'shut') {
            // «Lock»: shut (swinging) and locked
            for (const id of m.ids || []) {
                this.spelled.add(id);
                this.picked.delete(id); // (an earlier «Алохомора» of its own lock is spent: the door is shut)
                const d = g.doors?.list.get(id);
                if (!d) continue;
                d.spin = 0;
                if (d.a !== 0) this.closing.add(id);
                else this._clicked(d);
            }
            if (mine) g.hud?.setVoice('🔒 Дверь закрывается и запирается. Откроет её только «Алохомора»', true);
            return;
        } else if (m.k === 'unlock') {
            // «Алохомора» at a door shut by «Lock» (and, maybe, its own lock too)
            for (const id of m.ids || []) { this.spelled.delete(id); this.closing.delete(id); }
            if (m.own) { this.apply({ ...m.own, by: m.by }, mine); return; }
            for (const id of m.ids || []) {
                const d = g.doors?.list.get(id);
                if (!d) continue;
                if (!this.doorLocked(d) && Math.abs(d.a) < 0.2) g.doors._setAngle(d, 0.2 * (Math.sign(d.a) || 1));
                this._flash(d.model.userData.knob.getWorldPosition(new THREE.Vector3()));
            }
            const d0 = g.doors?.list.get(m.ids?.[0]);
            if (mine) g.hud?.setVoice(d0 && this.doorLocked(d0) ? '🗝️ «Lock» снят, но у двери свой крепкий замок' : '🗝️ Щёлк! Дверь отперта и приоткрылась — возьмитесь за ручку', true);
            g.sound?.playClang?.(0.2);
            return;
        } else if (m.k === 'lift') {
            // (host) a guest's hand lifted the lid of an unlocked chest
            const c = g.chests?.find((x) => x.id === m.id);
            if (this.auth && c && c.picked && !c.isOpen) g.openChest(c, null, m.by || m.from);
            return;
        }
        if (mine) g.hud?.setVoice(m.k === 'chest' ? '🗝️ Щёлк! Крышка приподнялась — поднимите её рукой' : m.k === 'gate' ? '🗝️ Ворота отперты и чуть приоткрылись — толкните створку рукой' : '🗝️ Щёлк! Дверь приоткрылась — возьмитесь за ручку и откройте', true);
        g.sound?.playClang?.(0.2);
    }

    _flash(p, big = false, color = 0xffe9a8) {
        const fx = this.game.fx;
        if (!fx?.spark || !p) return;
        for (let i = 0; i < (big ? 26 : 14); i++) fx.spark(p, i % 3 ? color : 0xffffff, 0.05 + Math.random() * 0.05, _v2.set((Math.random() - 0.5) * 1.6, Math.random() * 1.6, (Math.random() - 0.5) * 1.6), 0.6);
    }

    _gate(id) {
        let st = this.gates.get(id);
        if (!st) { st = { unlocked: false, broken: false, hits: 0 }; this.gates.set(id, st); }
        return st;
    }

    // ---------------------------------------------------------------- witnesses (host)
    /** A chest forced: only somebody who sees it cares — the family (a house), the guards (a castle). */
    _witness(c, by) {
        const L = this.game.castleLife;
        if (!L) return;
        if (c.house) L.theft?.(c.house.def, c.house.i, by, L._playerPos?.(by) || c.getPosition());
        else if (c.castle) L.forced?.(c.castle.id, by, c.getPosition());
        else if (c.cart) { const k = this.game.carriages?.list.get(c.cart.id); if (k?.party) this.game.travelers?.trouble(k.party, by); } // (the travellers' chest)
    }

    _witnessDoor(d, by) {
        const L = this.game.castleLife;
        const rec = [...(this.game.houses?.active.values() || [])].find((r) => r.doorId === d.id);
        if (L && rec) L.theft?.(rec.def, rec.i, by, L._playerPos?.(by) || d);
    }

    _witnessGate(id, by) {
        const rec = this.gateRecs.get(id);
        if (rec) this.game.castleLife?.forced?.(id, by, rec.def.throneGate);
    }

    // ---------------------------------------------------------------- blasts
    /** A blast (Bombardo, Maxima, Total Destruction…) at the gates: they hold one, the next breaks them. */
    blast(pos, radius, power = 1) {
        for (const [id, rec] of this.gateRecs) {
            const G = rec.def.throneGate;
            const st = this._gate(id);
            if (st.broken || Math.hypot(G.x - pos.x, G.y + 3 - pos.y, G.z - pos.z) > radius + G.w / 2 + 0.5) continue;
            st.hits += power;
            if (st.hits >= ALOHOMORA.GATE_HITS) this._break(id);
            else for (const did of rec.ids) { const d = this.game.doors?.list.get(did); if (d) d.shakeT = 0.5; }
        }
    }

    _break(id) {
        const g = this.game;
        const st = this._gate(id);
        st.broken = true;
        const rec = this.gateRecs.get(id);
        for (const did of rec?.ids || []) {
            const d = g.doors?.list.get(did);
            if (!d) continue;
            const debris = [];
            for (let i = 0; i < 12; i++) debris.push({ x: d.x + (Math.random() - 0.5) * 3, y: d.y + 0.5 + Math.random() * 5, z: d.z + (Math.random() - 0.5) * 3, color: i % 3 ? 0x6b4423 : 0x3a3a40, size: 0.7 });
            g.fx?.debrisFrom?.(debris, _v.set(d.x, d.y + 2, d.z), 24);
            g.doors.remove(did);
        }
    }

    // ---------------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        if ((this._scanT -= dt) <= 0) { this._scanT = 0.5; this._scanGates(); }
        this._gatesPass(dt);
        if (this.closing.size) this._closeLeaves(dt);
        if (this.auth && (this._lockT -= dt) <= 0) { this._lockT = 1; this._houseLocks(); }
        this._chestHands(dt);
    }

    /** (host) Which house doors are locked now; told to the others when it changes. */
    _houseLocks() {
        const g = this.game;
        for (const rec of g.houses?.active.values() || []) {
            if (!rec.doorId) continue;
            const l = this._houseLocked(rec);
            if (!!this.doorLocks.get(rec.doorId) === l) continue;
            this.doorLocks.set(rec.doorId, l);
            g.sync?.net?.send({ t: 'dlk', id: rec.doorId, l: l ? 1 : 0 }, true);
        }
    }

    applyDoorLock(id, l) { this.doorLocks.set(id, !!l); }

    /** The gates of the throne rooms near me: two leaves in the doorway of the keep. */
    _scanGates() {
        const g = this.game;
        const idx = g.houses?.index;
        if (!idx || !g.doors) return;
        const me = g.character.group.position;
        const seen = new Set();
        for (const def of idx.near(me.x, me.z, ALOHOMORA.NEAR)) {
            const G = def.throneGate;
            if (!G || Math.hypot(G.x - me.x, G.z - me.z) > ALOHOMORA.NEAR) continue;
            seen.add(def.id);
            if (this.gateRecs.has(def.id)) continue;
            const st = this._gate(def.id);
            const ids = [def.id + 'gL', def.id + 'gR'];
            if (!st.broken) {
                const ax = Math.cos(G.ry), az = -Math.sin(G.ry); // (along the gate: its local +X)
                const lw = G.w / 2;
                [-1, 1].forEach((s, k) => {
                    if (g.doors.list.has(ids[k])) return;
                    g.doors._place({ id: ids[k], x: G.x + ax * s * lw / 2, y: G.y, z: G.z + az * s * lw / 2, ry: G.ry, color: 0x5a3a1e, a: st.unlocked ? 0.2 : 0, w: lw, h: G.h, gen: true, gate: true, mirror: s > 0, castle: def.id });
                });
            }
            this.gateRecs.set(def.id, { def, ids, auto: false, openT: 0 });
        }
        for (const [id, rec] of [...this.gateRecs]) {
            if (seen.has(id)) continue;
            const G = rec.def.throneGate;
            if (Math.hypot(G.x - me.x, G.z - me.z) < ALOHOMORA.NEAR + 20) continue;
            for (const did of rec.ids) g.doors.remove(did);
            this.gateRecs.delete(id);
        }
    }

    /** The castle's people come to the gates: they open for them and close behind. */
    _gatesPass(dt) {
        const g = this.game, D = g.doors;
        if (!D || !this.gateRecs.size) return;
        const people = [...(g.castleLife?.byId?.values() || [])];
        const me = g.character.group.position;
        for (const [id, rec] of this.gateRecs) {
            const G = rec.def.throneGate;
            const leaves = rec.ids.map((x) => D.list.get(x)).filter(Boolean);
            if (!leaves.length || leaves.some((d) => d.holdSide || this.spelled.has(d.id))) continue; // («Lock»: shut for its own people too)
            const R = G.w / 2 + 3;
            let someone = null;
            for (const v of people) if (!v.dead && v.cs?.def?.id === id && Math.abs(v.x - G.x) < R && Math.abs(v.z - G.z) < R && Math.abs(v.y - G.y) < 4) { someone = v; break; }
            if (someone) {
                rec.auto = true; rec.openT = 0;
                // pushed open away from them, the way they walk (both leaves the same way)
                const sg = D.awaySign ? D.awaySign(leaves[0], someone.x, someone.z) : 1;
                for (const d of leaves) if (Math.abs(d.a) < 1.45) D.swing(d.id, sg * Math.min(1.45, Math.abs(d.a) + dt * 1.6));
            } else if (rec.auto) {
                rec.openT += dt;
                const clear = Math.abs(me.x - G.x) > R || Math.abs(me.z - G.z) > R; // (never shut onto me)
                if (clear && rec.openT > 2.5) {
                    let shut = true;
                    for (const d of leaves) { const a = Math.sign(d.a) * Math.max(0, Math.abs(d.a) - dt * 1.2); D.swing(d.id, a); if (a !== 0) shut = false; }
                    if (shut) rec.auto = false;
                }
            }
        }
    }

    /**
     * A chest's lid under my hands: a locked one only rattles; an unlocked one (open a crack)
     * follows the fingers under its front edge — lifted past the middle it falls open.
     */
    _chestHands(dt) {
        const g = this.game, ch = g.character;
        if (!g.currentPose || !g.chests?.length) { this.lift.left = this.lift.right = null; return; }
        const me = ch.group.position;
        for (const side of ['left', 'right']) {
            const G = g.doors?._hand ? g.doors._hand(side)?.G : ch.getHandWorldPosition(side, _v);
            if (!G) continue;
            let c = this.lift[side];
            if (c && (c.isOpen || !g.chests.includes(c))) { c = this.lift[side] = null; }
            if (!c) {
                for (const x of g.chests) {
                    if (x.isOpen || !x.locked) continue;
                    const p = x.getPosition();
                    if (Math.abs(p.x - me.x) + Math.abs(p.z - me.z) > 8) continue;
                    if (!this._atLidEdge(x, G)) continue;
                    if (!x.picked) { if (!(x.shakeT > 0)) { x.rattle(); g.sound?.playClang?.(0.1); this._chestHint(x); } continue; }
                    c = this.lift[side] = x;
                    break;
                }
                if (!c) continue;
            }
            // the lid follows the hand round its hinge (the hand off the lid's edge: it stays where it is)
            c.hingeOf(G, _h);
            // (the hand gone off the lid: it falls back onto the crack)
            const R = LID_LEN * (c.scale || 1);
            if (_h.r > R * 2 + 0.5 || _h.r < R * 0.45 || Math.abs(_h.x) > CHEST_W * (c.scale || 1) / 2 + 0.6) { this.lift[side] = null; if (this.lift.left !== c && this.lift.right !== c) c.liftTo(0); continue; }
            if (c.liftTo(_h.angle)) {
                this.lift[side] = null;
                if (this.auth) g.openChest(c, null, g.localId);
                else if (!c._asked) { c._asked = true; g.sync?.net?.send({ t: 'lock', k: 'lift', id: c.id, by: g.localId }); }
            }
        }
    }

    /**
     * Are the fingers at the lid's front edge — anywhere along it, a big chest's corner as well as its
     * middle: at the edge's distance from the hinge, at its height or just under it (to lift it)?
     */
    _atLidEdge(c, G) {
        const k = c.scale || 1, R = LID_LEN * k;
        c.hingeOf(G, _h);
        if (Math.abs(_h.x) > CHEST_W * k / 2 + 0.25) return false;
        if (Math.abs(_h.r - R) > 0.2 * k + 0.15) return false;
        const a = -c.lidGroup.rotation.x; // (the lid's angle now)
        return _h.angle > a - 0.5 && _h.angle < a + 0.55;
    }

    _chestHint(c) {
        const now = performance.now();
        if (now - this._hintT < 3500) return;
        this._hintT = now;
        const k = chestKind(c);
        // (only when the hand really tries the lid — never just for walking past a chest)
        this.game.hud?.setVoice(k === 'towerChest' ? '🔒 Сундук академии заперт чарами. Откроется, когда падёт Мастер'
            : k === 'settlementChest' ? '🔒 Сундук заперт — покажите на замок и скажите «Алохомора» (если стража увидит — это кража)'
                : '🔒 Заперто — покажите на замок и скажите «Алохомора»', true);
    }

    // ---------------------------------------------------------------- net / save
    /** A chest is made (a house / a castle comes near): it remembers the spell. */
    restoreChest(c) { if (this.chests.has(c.id) && !c.isOpen) c.setAjar(); }

    snapshot() {
        return { c: [...this.chests], d: [...this.picked], g: [...this.gates], l: [...this.doorLocks].filter(([, v]) => v).map(([k]) => k), s: [...this.spelled] };
    }

    restore(s) {
        if (!s) return;
        for (const id of s.c || []) { this.chests.add(id); const c = this.game.chests?.find((x) => x.id === id); if (c && !c.isOpen) c.setAjar(); }
        for (const id of s.d || []) this.picked.add(id);
        for (const [id, st] of s.g || []) {
            this.gates.set(id, { unlocked: !!st.unlocked, broken: !!st.broken, hits: +st.hits || 0 });
            if (st.broken && this.gateRecs.has(id)) for (const did of this.gateRecs.get(id).ids) this.game.doors?.remove(did);
        }
        for (const id of s.l || []) this.doorLocks.set(id, true);
        for (const id of s.s || []) { this.spelled.add(id); const d = this.game.doors?.list.get(id); if (d && d.a !== 0) this.closing.add(id); }
    }

    /** A message from the others: {t: 'lock', k, id, by} / {t: 'dlk', id, l}. */
    applyNet(m) {
        if (m.t === 'dlk') { if (!this.auth) this.applyDoorLock(m.id, m.l); return; }
        if (m.by === this.game.localId) return;
        this.apply(m, false);
    }
}

function hash01(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13;
    return ((h >>> 0) % 10000) / 10000;
}
