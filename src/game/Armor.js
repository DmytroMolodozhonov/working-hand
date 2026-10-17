/**
 * Armor.js — wearing armour and robes (the rules of the things: ArmorTypes.js; the look:
 * entities/ArmorLook.js).
 *
 *  - Put on by hand, no magic: a piece in the hand held at its place on the body for a moment —
 *    the helmet on the head, the breastplate (or a robe) on the chest, the greaves on the knee
 *    (ArmorTypes.wearSpot). The piece worn before goes into a slot.
 *  - «Suit Up» (5 mana, known without a scroll): the best of the armour in the slots and of what
 *    lies near (a dead knight's plates, a wizard's robe) is put on at once.
 *  - Worn: the steel takes blows and spells for its points (Combat.damage → absorb); a plain
 *    piece beaten to 0 falls apart; magic ones mend themselves. The whole magic set / a magic
 *    robe turn the simplest magic away (guard), arrows bounce off magic steel (arrowBounces) —
 *    the knights who see their arrows bounce stop shooting a while (bouncesArrows).
 *  - «Disarmor» with the wand up to the sky: the same off myself (disarmSelf), dropped by me.
 *  - «Disarmor» (a duel charge): plain steel and a plain robe fly off in all directions as real
 *    things — off me (my own computer decides), off another player (theirs), off a knight or the
 *    king (the host: they fight on without it), off a wizard's plain robe. Magic steel and a magic
 *    robe stay on (ArmorTypes.DISARMOR_TARGETS).
 *  - The cells on the right of the screen (one above the other) show what is worn — only while
 *    something is.
 *  - Network: everybody sees what everybody wears ('arm' {a:'worn'}); the host strips the
 *    villagers ('arm' {a:'vstrip'}).
 */

import * as THREE from 'three';
import { PIECES, ARMOR, pieceMax, wornEffects, spellGuard, soakBlow, wornCode, wearSpot, armorName, makePiece, rollNamedSet, makeRobe } from './ArmorTypes.js';
import { dressArmor } from '../entities/ArmorLook.js';
import { strippedLook, VillagerModel } from '../entities/VillagerModel.js';
import { pickFlight } from './Expelliarmus.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const SLOTS = ['helmet', 'chest', 'legs', 'robe'];
const slotOf = (it) => (it?.kind === 'robe' ? 'robe' : it?.kind === 'armor' ? it.piece : null);
const score = (it) => (!it ? 0 : it.archmage ? 9 : (it.named ? 4 : it.magic ? 3 : 2) + (it.kind === 'armor' ? 0.5 * (it.hp ?? 0) / Math.max(1, pieceMax(it)) : 0));

/** A small picture of a piece for the cells (SVG, 24×24). code: 1 plain, 2 magic, 3 named; robe colour. */
export function armorIcon(slot, code = 1, color = 0) {
    if (slot === 'robe' && code === 4) return '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M10 2h4l1 6 4 13H5L9 8z" fill="#15183f" stroke="#e7c25a" stroke-width="1.2"/><path d="M12 9l1 2.2 2.3.2-1.8 1.5.6 2.3-2.1-1.2-2.1 1.2.6-2.3-1.8-1.5 2.3-.2z" fill="#ffd36e"/><circle cx="12" cy="18" r="0.9" fill="#9fe8ff"/></svg>';
    const fill = slot === 'robe' ? '#' + ((color || (code >= 2 ? 0x4b2a7a : 0x2c3e7a)) >>> 0).toString(16).padStart(6, '0') : code === 3 ? '#ffd36e' : code === 2 ? '#bcd6ff' : '#b8c2cc';
    const stroke = code >= 2 ? '#e8f2ff' : '#3a4048';
    const path = {
        helmet: 'M4 15C4 8 8 4 12 4s8 4 8 11v4h-5v-5H9v5H4z',
        chest: 'M6 4l3 1 3 2 3-2 3-1 3 4-3 2v10H6V10L3 8z',
        legs: 'M5 3h5v15h1v3H5zM14 3h5v18h-6v-3h1z',
        robe: 'M10 2h4l1 6 4 13H5L9 8z',
    }[slot];
    return `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>${slot === 'robe' && code >= 2 ? '<circle cx="12" cy="13" r="1.2" fill="#fff2a0"/>' : ''}</svg>`;
}

export class ArmorSystem {
    constructor(game) {
        this.game = game;
        this.worn = { helmet: null, chest: null, legs: null, robe: null };
        this.fx = wornEffects(this.worn);
        this.remote = new Map(); // playerId -> worn code (what the others wear)
        this.stripped = new Set(); // villager ids «Disarmor» stripped (their look stays so)
        this._wearT = { right: 0, left: 0 };
        this._told = new Set(); // (piece kinds whose «how to put it on» was said)
        this._statsOn = { maxHp: 0, maxMana: 0 };
        this._healT = 0;
        this._suitUntil = 0;
        this._key = '';
    }

    // ------------------------------------------------------------ what is worn
    /** Put a thing on (from the hand, a slot, «Suit Up»). The piece worn there before → a slot (or the ground). */
    wear(item, { quiet = false } = {}) {
        const slot = slotOf(item);
        if (!slot) return false;
        const g = this.game;
        // (the High Mage's suit: only a High Mage wears it — Achievements.js)
        if (item.archmage && g.achievements && !g.achievements.high) {
            if (!quiet) g.hud?.setVoice?.('🌟 Этот костюм наденет только Высший маг', true);
            return false;
        }
        if (item.kind === 'armor' && item.hp == null) item.hp = pieceMax(item);
        const old = this.worn[slot];
        this.worn[slot] = item;
        if (old) this._stow(old);
        this._changed();
        if (!quiet) {
            g.hud?.setVoice?.(`${item.archmage ? '🌟' : slot === 'robe' ? '🧥' : '🪖'} Надето: <b>${armorName(item)}</b>${item.magic ? ' ✨' : ''}`, true);
            if (!(performance.now() - (this._clinkAt || -1e9) < 1200)) { this._clinkAt = performance.now(); g.sound?.playSpellFx?.('fxSuitUp'); } // (the plates clinking on: once for a whole «Suit Up»)
            if (item.archmage) this._suitGlow();
        }
        return true;
    }

    /** Into a slot, or (no room) it falls at the feet. */
    _stow(it) {
        const g = this.game;
        if (g.inventory?.storeItem?.(it)) return;
        const p = g.character.group.position.clone().add(_v.set(0, 1, 0));
        if (g.items?.auth || !g.sync) g.items?.spawnLoose(it, p, { vel: _v2.set(0, 1, 0) });
        else g.sync.itemThrow?.(it, p, _v2.set(0, 1, 0));
    }

    /** A golden whirl round me: the High Mage's suit put on. */
    _suitGlow() {
        const g = this.game, c = g.character?.group?.position;
        if (!c) return;
        for (let i = 0; i < 48; i++) {
            const a = i / 48 * Math.PI * 4;
            g.fx?.spark(_v.set(c.x + Math.cos(a) * 0.8, c.y + i / 48 * 2.4, c.z + Math.sin(a) * 0.8), i % 3 ? 0xffd36e : 0x9fe8ff, 0.08, _v2.set(Math.cos(a), 1.2, Math.sin(a)), 0.9);
        }
        g.fx?.lightFlash?.(_v.set(c.x, c.y + 1.2, c.z), 0xffd36e, 2, 0.4, 12);
    }

    /** Everything worn comes off (the High Mage's suit only with `suit` — death: all of it drops with the rest). */
    takeOffAll({ suit = false } = {}) {
        const out = SLOTS.map((s) => this.worn[s]).filter((it) => it && (suit || !it.archmage));
        for (const s of SLOTS) if (suit || !this.worn[s]?.archmage) this.worn[s] = null;
        this._changed();
        return out;
    }

    _changed() {
        const g = this.game;
        this.fx = wornEffects(this.worn);
        const code = wornCode(this.worn);
        if (g.character) dressArmor(g.character, code);
        this._restat();
        this._renderCells();
        this.sendWorn();
    }

    /** The perks' numbers the game reads (run, fly, push, manaRegen, cost…). */
    stat(name, def = 1) { return this.fx.stat[name] ?? def; }

    /** +HP / +mana while a named piece is worn: the maxima change as it goes on and off. */
    _restat() {
        const c = this.game.combat;
        if (!c) return;
        const hp = this.fx.stat.maxHp || 0, mana = this.fx.stat.maxMana || 0;
        const dh = hp - this._statsOn.maxHp, dm = mana - this._statsOn.maxMana;
        if (dh) { c.maxHp = Math.max(1, (c.maxHp || 20) + dh); c.hp = Math.min(c.maxHp, c.hp); }
        if (dm) { c.maxFatigue = Math.max(1, (c.maxFatigue || 30) + dm); c.fatigue = Math.min(c.maxFatigue, c.fatigue); }
        this._statsOn = { maxHp: hp, maxMana: mana };
        const ch = this.game.character;
        if (ch) ch.armorRun = this.stat('run');
        if (this.game.flight) this.game.flight.armorK = this.stat('fly');
    }

    anyWorn() { return SLOTS.some((s) => this.worn[s]); }

    // ------------------------------------------------------------ protection
    /**
     * A blow on me (Combat.damage): the steel takes its share, a perk / the robe soften it.
     * → what reaches the health.
     */
    absorb(amount, kind) {
        if (!(amount > 0)) return amount;
        if (kind === 'fall' && this.fx.stat.noFall && amount < 8) return 0; // (very strong falls still hurt)
        if (!this.anyWorn()) return amount;
        const res = soakBlow(this.worn, this.fx, amount, kind);
        for (const [slot, n] of Object.entries(res.wear)) {
            const it = this.worn[slot];
            if (!it) continue;
            it.hp = Math.max(0, (it.hp ?? pieceMax(it)) - n);
            this._clang(slot);
            if (it.hp <= 0 && !it.magic) this._broken(slot);
        }
        if (Object.keys(res.wear).length) this._renderCells();
        return res.hp;
    }

    _clang(slot) {
        const g = this.game, ch = g.character;
        const at = (slot === 'helmet' ? ch.head : slot === 'legs' ? ch.leftLegPivot : ch.torso)?.getWorldPosition(_v);
        if (!at) return;
        if (slot === 'legs') at.y -= 1;
        const col = this.worn[slot]?.magic ? 0x9fd8ff : 0xdddddd;
        for (let i = 0; i < 6; i++) g.fx?.spark(at, col, 0.07, _v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.35);
    }

    /** A plain piece beaten to nothing: it falls apart (it is gone). */
    _broken(slot) {
        const it = this.worn[slot];
        this.worn[slot] = null;
        this._changed();
        this.game.hud?.setVoice?.(`💥 ${armorName(it)} разбит — доспех развалился`, true);
    }

    /**
     * A spell reaches me (a duel charge, a beam, the cold): does it act? True = it does nothing
     * (it bounces off the magic steel / the robe; I see sparks and a word).
     */
    guard(spell, { quiet = false } = {}) {
        const r = spellGuard(this.fx, spell);
        if (!r.block) return false;
        if (!quiet) {
            const g = this.game, c = g.character.group.position;
            const col = r.why === 'robe' ? 0xc39bff : 0x9fd8ff;
            for (let i = 0; i < 16; i++) g.fx?.spark(_v.set(c.x, c.y + 1.2, c.z), col, 0.1, _v2.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.5);
            const now = performance.now();
            if (now - (this._saidAt || 0) > 1500) {
                this._saidAt = now;
                g.hud?.setVoice?.(r.why === 'robe' ? (this.fx.archmage ? '🌟 Костюм Высшего мага отвёл заклинание' : '🧙 Волшебная мантия отвела заклинание') : r.why === 'perk' ? '✨ Именной доспех: это заклинание вас не берёт' : '✨ Волшебные доспехи отразили заклинание', true);
            }
        }
        return true;
    }

    /** How strong a spell's harm still is on me (the whole magic set: «Инферно» half). */
    spellMult(spell) { const r = spellGuard(this.fx, spell); return r.block ? 0 : r.mult; }

    /** An arrow reaches me: does it bounce off magic steel? (where it lands: a piece's share) */
    arrowBounces() {
        let x = Math.random();
        for (const p of PIECES) { x -= ARMOR.COVER[p]; if (x < 0) return !!this.worn[p]?.magic; }
        return false;
    }

    /** (a knight's eyes) Do arrows bounce off this player? (most of the body in magic steel) */
    bouncesArrows(id) {
        const g = this.game;
        const code = !id || id === g.localId || id === 'local' ? wornCode(this.worn) : this.remote.get(id);
        if (!code) return false;
        return (code.h >= 2 ? ARMOR.COVER.helmet : 0) + (code.c >= 2 ? ARMOR.COVER.chest : 0) + (code.l >= 2 ? ARMOR.COVER.legs : 0) >= 0.5;
    }

    // ------------------------------------------------------------ the hands put it on
    _handWear(dt) {
        const g = this.game, ch = g.character, items = g.items;
        if (!items || !ch?.group || g.combat?.dead) return;
        for (const side of ['right', 'left']) {
            const h = items.held[side];
            const slot = slotOf(h?.item);
            if (!slot || (h.item.shop && !h.item.shop.paid)) { this._wearT[side] = 0; continue; }
            // (taken in a hand — from the ground, by «Accio», from a slot: where it goes on, once a piece kind)
            if (!this._told.has(slot) && !this.worn[slot]) {
                this._told.add(slot);
                g.hud?.setVoice?.({ helmet: '🪖 Чтобы надеть шлем — поднесите его к голове и подержите', chest: '🪖 Чтобы надеть нагрудник — приложите его к груди и подержите', legs: '🪖 Чтобы надеть поножи — приложите их к бедру спереди и подержите', robe: '🧥 Чтобы надеть мантию — приложите её к груди и подержите' }[slot], true);
            }
            ch.group.updateMatrixWorld(true);
            _inv.copy(ch.group.matrixWorld).invert();
            const hand = ch.getHandWorldPosition(side, _v).applyMatrix4(_inv);
            // (held there: the time adds up; a frame's jitter out of the place only takes a little off, it does not start over)
            if (wearSpot(h.item.kind, h.item.piece, hand, g.currentPose?.bodyTouch?.[side] ?? null)) this._wearT[side] += dt; else this._wearT[side] = Math.max(0, this._wearT[side] - 1.5 * dt);
            if (this._wearT[side] < ARMOR.WEAR_T) continue;
            this._wearT[side] = 0;
            const inv = g.inventory;
            const item = items.releaseHand(side);
            if (inv?.inHand?.item === item) inv.inHand = null;
            this.wear(item);
        }
    }

    // ------------------------------------------------------------ «Suit Up»
    /** «Suit Up»: the best armour of the slots and of what lies near — on, all at once. */
    suitUp(isFinal = true) {
        const g = this.game, c = g.combat;
        const tired = c?.check?.('SuitUp');
        if (tired) { if (isFinal) g.hud.setVoice(tired, true); return null; }
        const me = g.character.group.position;
        const best = {};
        for (const s of SLOTS) best[s] = { score: score(this.worn[s]), it: null, from: null };
        const inv = g.inventory;
        (inv?.slots || []).forEach((it, i) => { const s = slotOf(it); if (s && score(it) > best[s].score) best[s] = { score: score(it), it, from: { slot: i } }; });
        for (const L of g.items?.loose.values() || []) {
            const s = slotOf(L.item);
            if (!s || (L.item.shop && !L.item.shop.paid) || L.asked || L.model.position.distanceTo(me) > ARMOR.SUIT_UP_R) continue;
            if (score(L.item) > best[s].score) best[s] = { score: score(L.item), it: L.item, from: { loose: L } };
        }
        const todo = SLOTS.filter((s) => best[s].it);
        if (!todo.length) { if (isFinal) g.hud.setVoice('🪖 «Suit Up»: надеть нечего — ни в ячейках, ни рядом нет доспехов лучше надетых', true); return null; }
        c?.pay?.('SuitUp');
        let n = 0;
        for (const s of todo) {
            const b = best[s];
            if (b.from.slot != null) { inv.slots[b.from.slot] = null; this.wear(b.it, { quiet: true }); n++; continue; }
            const L = b.from.loose;
            if (g.items.auth) {
                const item = g.items.removeLoose(L.item.uid);
                // (a thing of a house chest taken while its people see it is a theft — as by hand)
                if (item.home) { const home = item.home; delete item.home; g.castleLife?.tookFromHome?.(home, g.localId); }
                g.sync?.itemGone?.(item.uid, g.localId, 'slot');
                this.wear(item, { quiet: true });
                n++;
            } else {
                // (a guest asks the host for it: it comes into a slot — put on from there as soon as it is in)
                L.asked = true; g.sync?.itemTake?.(L.item.uid, 'slot'); setTimeout(() => { L.asked = false; }, 1500);
                this._suitUntil = performance.now() + 2500;
                n++;
            }
        }
        inv?._render?.();
        const p = me.clone().add(_v.set(0, 1.2, 0));
        for (let i = 0; i < 30; i++) g.fx?.spark(p, i % 2 ? 0xdde6f0 : 0x9fd8ff, 0.1, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.6);
        g.fx?.lightFlash?.(p, 0xbcd6ff, 1.5, 0.3, 12);
        g.hud.setVoice(`🪖 «Suit Up»: надето ${n} ${n === 1 ? 'вещь' : n < 5 ? 'вещи' : 'вещей'}`, true);
        return 'SuitUp';
    }

    /** (a guest's «Suit Up») the things asked for arrive in the slots: on with them. */
    _suitPending() {
        if (!this._suitUntil || performance.now() > this._suitUntil) { this._suitUntil = 0; return; }
        const inv = this.game.inventory;
        (inv?.slots || []).forEach((it, i) => {
            const s = slotOf(it);
            if (s && score(it) > score(this.worn[s])) { inv.slots[i] = null; this.wear(it, { quiet: true }); inv._render?.(); }
        });
    }

    // ------------------------------------------------------------ «Disarmor»
    /**
     * «Disarmor» said with the wand (the hand) raised to the sky: off myself — the same as the charge
     * takes (plain steel, a plain robe; magic ones and the High Mage's suit stay), its mana, no jolt.
     * The pieces drop around me as things (the others see them: itemThrow / spawnLoose, 'worn').
     */
    disarmSelf(isFinal = true) {
        const g = this.game, c = g.combat;
        const now = Date.now();
        if (now - (g._lastDuelCast || 0) < 900) return null; // (the same word heard again)
        const off = SLOTS.filter((s) => this.worn[s] && !this.worn[s].magic);
        if (!off.length) {
            if (isFinal) g.hud?.setVoice?.(this.anyWorn() ? '✨ «Disarmor»: волшебное с себя не снять' : '🪖 «Disarmor»: на вас нечего снимать', true);
            return null;
        }
        const tired = c?.check?.('Disarmor');
        if (tired) { if (isFinal) g.hud?.setVoice?.(tired, true); return null; }
        c?.pay?.('Disarmor');
        g._lastDuelCast = now;
        g.sound?.playSpellFx?.('fxDisarmor');
        const p = g.character.group.position;
        for (let i = 0; i < 20; i++) g.fx?.spark(_v.set(p.x, p.y + 1.2, p.z), 0x8fa3b8, 0.08, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.5);
        this.disarmorMe(g.localId, { self: true, gentle: true });
        return 'Disarmor';
    }

    /** «Disarmor» hit me: my plain steel (and a plain robe) flies off in all directions (`gentle`: off myself — it drops by me). */
    disarmorMe(byId, { self = false, gentle = false } = {}) {
        const g = this.game;
        const off = SLOTS.filter((s) => this.worn[s] && !this.worn[s].magic);
        if (!off.length) {
            g.hud?.setVoice?.(this.anyWorn() ? '✨ «Disarmor»: волшебное не снять — всё осталось на вас' : '🪖 «Disarmor» попал в вас, но снимать было нечего', true);
            return 0;
        }
        const ch = g.character;
        for (const s of off) {
            const it = this.worn[s];
            this.worn[s] = null;
            const from = (s === 'helmet' ? ch.head : s === 'legs' ? ch.leftLegPivot : ch.torso).getWorldPosition(new THREE.Vector3());
            if (s === 'legs') from.y -= 0.8;
            const f = gentle ? { vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()) } : pickFlight(g, from);
            if (g.items?.auth || !g.sync) g.items?.spawnLoose(it, from, { vel: f.vel, spin: f.spin });
            else g.sync.itemThrow?.(it, from, f.vel, null, f.spin);
        }
        this._changed();
        g.hud?.setVoice?.(`🪖💨 «Disarmor»! ${self ? 'Вы сняли с себя' : 'С вас слетело'}: ${off.map((s) => armorName({ kind: s === 'robe' ? 'robe' : 'armor', piece: s })).join(', ').toLowerCase()} — подберите`, true);
        return off.length;
    }

    /** Was this villager stripped by «Disarmor»? (its look is made so again when it comes back) */
    wasStripped(id) { return this.stripped.has(id); }

    /**
     * (host) «Disarmor» on a castle person: a knight's / the king's plates fly off as things
     * (they fight on without them); a wizard's plain robe too. → 'strip' | 'magic' | 'none'
     */
    stripVillager(v, byId = null) {
        const g = this.game;
        if (v.dead || v.stripped) return 'none';
        const steel = v.role === 'knight' || v.role === 'king';
        if (!steel && !v.wizard) return 'none';
        if (v.wizard && v.robe) return 'magic'; // (a magic robe stays on)
        const drops = steel ? this._villagerSteel(v) : [makeRobe(false)];
        if (steel) { v.armor = 0; v.maxArmor = 0; }
        this._restyle(v);
        const at = new THREE.Vector3(v.x, v.y + 2.2, v.z);
        for (const it of drops) { const f = pickFlight(g, at); g.items?.spawnLoose(it, at, { vel: f.vel, spin: f.spin }); }
        g.sync?.armor?.({ a: 'vstrip', id: v.id });
        g.castleLife?._say?.(v, steel ? 'Мои латы!' : 'Моя мантия!', 3);
        return 'strip';
    }

    /**
     * (host) A knight / the king who can't get out of deep water in his plates throws them off
     * (CreatureSwim.js): they sink by him — lying on the bottom, to be dived for — and he swims on.
     */
    shedVillager(v) {
        const g = this.game;
        if (v.dead || v.stripped || !(v.role === 'knight' || v.role === 'king')) return false;
        const drops = this._villagerSteel(v);
        v.armor = 0; v.maxArmor = 0;
        this._restyle(v);
        for (const it of drops) {
            const at = new THREE.Vector3(v.x + (Math.random() - 0.5), v.y + 0.8, v.z + (Math.random() - 0.5));
            g.items?.spawnLoose(it, at, { vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -1, (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()) });
        }
        g.sync?.armor?.({ a: 'vstrip', id: v.id });
        g.castleLife?._say?.(v, 'Прочь латы! Иначе утону!', 3);
        return true;
    }

    /** A knight's / the king's plates as things (as beaten as his armour was). */
    _villagerSteel(v) {
        const k = v.maxArmor > 0 ? Math.max(0.1, (v.armor || 0) / v.maxArmor) : 1;
        return ['helmet', 'chest', 'legs'].map((p) => { const it = makePiece(p); it.hp = Math.max(1, Math.round(it.hp * k)); return it; });
    }

    /** The villager's model made again without the steel / the plain robe (every computer). */
    _restyle(v) {
        v.stripped = true;
        this.stripped.add(v.id);
        const old = v.model;
        if (!old?.look) return;
        const m = new VillagerModel(strippedLook(old.look), { castleColor: old.look.castleColor, shield: !!old.shield });
        m.group.position.copy(old.group.position);
        m.group.rotation.copy(old.group.rotation);
        old.group.parent?.add(m.group);
        old.dispose();
        v.model = m; v.group = m.group;
        if (v.disarmed) m.setHeldTool?.('none');
    }

    /** What a dead castle person leaves of armour (Death.villagerDied): a knight's plates, a wizard's magic robe. */
    villagerLoot(v) {
        if ((v.role === 'knight' || v.role === 'king') && !v.stripped) return this._villagerSteel(v);
        if (v.wizard && v.robe) return [makeRobe(true)];
        return [];
    }

    /** A dragon's lair: the named set (and now and then a magic robe) among the gold. */
    lairHoard(rng = Math.random) {
        const out = rollNamedSet(rng);
        if (rng() < 0.15) out.push(makeRobe(true, rng));
        return out;
    }

    // ------------------------------------------------------------ the network
    sendWorn() {
        const g = this.game;
        const code = wornCode(this.worn);
        const key = JSON.stringify(code);
        if (key === this._key && !this._force) return;
        this._key = key; this._force = false;
        g.sync?.armor?.({ a: 'worn', w: code });
    }

    /** (a newcomer) tell what I wear again. */
    resend() { this._force = true; this.sendWorn(); }

    onNet(m, from) {
        const g = this.game;
        if (m.a === 'worn' && from && from !== g.localId) {
            const w = m.w || {};
            const clean = { h: w.h | 0, c: w.c | 0, l: w.l | 0, r: w.r | 0, rc: +w.rc || 0 };
            this.remote.set(from, clean);
            const r = g.remotes?.get(from);
            if (r?.character) { dressArmor(r.character, clean); r.character._armorKey = JSON.stringify(clean); }
        } else if (m.a === 'vstrip' && !g.authority) {
            const v = g.castleLife?.byId?.get(m.id);
            this.stripped.add(m.id);
            if (v && !v.stripped) this._restyle(v);
        }
    }

    // ------------------------------------------------------------ every frame
    update(dt) {
        const g = this.game;
        this._handWear(dt);
        this._suitPending();
        // magic steel mends itself (a perk: faster)
        let mended = false;
        for (const s of PIECES) {
            const it = this.worn[s];
            if (it?.magic && it.hp < pieceMax(it)) { it.hp = Math.min(pieceMax(it), it.hp + ARMOR.REGEN * this.stat('mend') * dt); mended = true; }
        }
        if (mended) { this._cellT = (this._cellT || 0) - dt; if (this._cellT <= 0) { this._cellT = 1; this._renderCells(); } }
        // a perk: the wounds close by themselves
        const heal = this.fx.stat.heal || 0;
        const c = g.combat;
        if (heal && c?.enabled && !c.dead && c.hp < (c.maxHp || 20)) {
            this._healT += heal * dt;
            if (this._healT >= 1) { this._healT -= 1; c.heal?.(1); }
        }
        // the others: dressed as they told (an avatar made after the message too)
        for (const [id, code] of this.remote) {
            const r = g.remotes?.get(id);
            if (!r) { this.remote.delete(id); continue; }
            const key = JSON.stringify(code);
            if (r.character && r.character._armorKey !== key) { dressArmor(r.character, code); r.character._armorKey = key; }
        }
    }

    // ------------------------------------------------------------ the cells (right side)
    _renderCells() {
        if (typeof document === 'undefined') return;
        // (the extra health of the armour under the HP bar: the points all the pieces worn can still take)
        let cur = 0, max = 0;
        for (const s of SLOTS) { const it = this.worn[s]; if (it?.kind === 'armor') { const m = pieceMax(it); max += m; cur += Math.min(m, it.hp ?? m); } }
        this.game.hud?.setArmor?.(cur, max);
        let el = document.getElementById('armor-cells');
        if (!this.anyWorn()) { if (el) el.style.display = 'none'; return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'armor-cells';
            el.innerHTML = SLOTS.map((s) => `<div class="armor-cell" data-slot="${s}"><div class="ac-icon"></div><div class="ac-bar"><i></i></div></div>`).join('');
            document.body.appendChild(el);
        }
        el.style.display = 'flex';
        const code = wornCode(this.worn);
        const k = { helmet: 'h', chest: 'c', legs: 'l', robe: 'r' };
        for (const s of SLOTS) {
            const cell = el.querySelector(`[data-slot="${s}"]`);
            const it = this.worn[s];
            const c = code[k[s]];
            cell.classList.toggle('on', !!it);
            cell.classList.toggle('magic', c >= 2);
            cell.querySelector('.ac-icon').innerHTML = armorIcon(s, c || 1, s === 'robe' ? code.rc : 0);
            cell.title = it ? armorName(it) : { helmet: 'Шлем — не надет', chest: 'Нагрудник — не надет', legs: 'Поножи — не надеты', robe: 'Мантия — не надета' }[s];
            const bar = cell.querySelector('.ac-bar');
            const show = it?.kind === 'armor';
            bar.style.visibility = show ? 'visible' : 'hidden';
            if (show) bar.firstChild.style.width = Math.round(100 * (it.hp ?? 0) / Math.max(1, pieceMax(it))) + '%';
        }
    }

    // ------------------------------------------------------------ the save
    snapshot() { return SLOTS.map((s) => this.worn[s]); }
    restore(list) {
        if (!Array.isArray(list)) return;
        list.forEach((it, i) => { if (it && slotOf(it) === SLOTS[i]) this.worn[SLOTS[i]] = it; });
        this._changed();
    }

    dispose() {
        if (typeof document !== 'undefined') document.getElementById('armor-cells')?.remove();
    }
}
