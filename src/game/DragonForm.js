/**
 * DragonForm.js — «Зелье превращения в дракона» (the author 05.11: «превращение в дракона, 10 минут, не чёрная магия: яйцо дракона +
 * перо феникса»). Drunk — the hero's body melts into a dragon's: for DRAGON_FORM.S s the player IS a dragon, then a man again where the
 * dragon stands.
 *
 * How (no second way of flying a dragon): the body of the dragon is an ordinary dragon of the world (Dragons.spawn, `d.form` = whose it
 * is), the mind in it is driven exactly as by «Империус Максима» (ImperiusControl with the name 'DragonForm': run on the spot — it runs;
 * having run, strokes of both arms — it takes off; the long «У-у-у» — fire; the wings and the body break what they strike — DragonSmash).
 * What is not as in «Империус»: no mana while it holds, no link that tears (there is no body left standing: the hero's body is IN the
 * dragon — hidden, carried along, harmless and unharmed), «стоп» does not end it (a potion, not a spell: the potion of resetting does),
 * and when it ends the hero stands where the dragon was.
 *
 * Who / what (DRAGON_FORM_TARGETS): the dragon of the form is a dragon for the whole world — the spells, the blasts, the knights, the
 * other dragons treat it as a dragon (all the places that look for creatures already hold the dragons: Duel._bodies, Game.explode,
 * CreatureImpact, Levitation…); its fire and its body are the dragon's (DragonImperius.FLAME_TARGETS, SMASH).
 *
 * What may go wrong (CLAUDE.md «а если…» — each one handled below):
 *  - drunk in a cave, a house, under a roof, on a ship, in the saddle, on a broom, swimming, in space / hell, dead → not drunk (the flask
 *    stays full), the reason said (`cantNow`);
 *  - drunk again while a dragon → the time starts again (PotionEffects.start), no second dragon;
 *  - the dragon killed → the form ends: the hero falls out of it on the ground, stunned a little, with HP_AFTER of their health — no egg,
 *    no wand, no achievement drops off one's own body (Dragons._die);
 *  - the potion of resetting / the time out → back (`end`); the hero dies some other way (cannot: unharmed) → `onDeath` ends it anyway;
 *  - the game saved and loaded in the form → the time left is kept, but the dragon is not: on load the hero stands on the ground under the
 *    place (`restoreLanded`) and the form starts again from the time left;
 *  - a guest (multiplayer) → the host makes the dragon and gives the mind to the guest (`dform` ask → Imperius 'took' with mx 2); the host
 *    gone → the session ends anyway; the others see no hero (the pose flag px 4 hides the avatar) — only the dragon;
 *  - the dragon in the air when it ends → the hero comes down gently (the ground under the dragon), never a fall.
 */
import * as THREE from 'three';
import { rollDragon, DRAGON_HP } from './DragonKinds.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { BLOCK } from '../world/Terrain.js';

export const DRAGON_FORM = {
    S: 600, // s (the author: 10 minutes)
    ROOM_R: 3, // m round the hero: free of blocks…
    ROOM_UP: 9, // …this high over the feet (a dragon is ~8 m high standing: a cave, a house, under a roof — no room)
    HP_AFTER: 0.5, // the dragon killed: the hero has half their health
    STUN: 1.6, // s: …and is stunned a moment, coming out of it
    ASK_T: 5000, // ms: a guest waits for the host's dragon this long
};

/** On whom / on what the form acts (the dragon's own tables do the rest). */
export const DRAGON_FORM_TARGETS = {
    hero: { does: 'тело героя внутри дракона', why: 'спрятано и неуязвимо, пока длится превращение; кончилось — герой стоит там, где был дракон' },
    dragon: { does: 'дракон для всего мира', why: 'заклинания, взрывы, рыцари и другие драконы действуют на него как на любого дракона' },
    fire: { does: 'огонь дракона', why: 'поджигает как у дракона (DragonImperius.FLAME_TARGETS)' },
    body: { does: 'крылья и тело ломают', why: 'как у дракона под «Империус Максима» (DragonSmash)' },
    spells: { does: 'колдовать нельзя', why: 'у дракона нет палочки и рук волшебника — только огонь и сила тела' },
};

/** What a dragon stands in or brushes aside (not a wall). */
const SOFT = new Set([BLOCK.WATER, BLOCK.LEAVES, BLOCK.BIRCH_LEAVES, BLOCK.SPRUCE_LEAVES, BLOCK.CHERRY_LEAVES, BLOCK.DARK_LEAVES, BLOCK.FLOWERS, BLOCK.WHEAT, BLOCK.VEG].filter((v) => v != null));

/** Is there room for a dragon here? `get(x, y, z)` → block id; feet: the feet's layer. */
export function roomFor(get, x, feet, z) {
    const R = DRAGON_FORM.ROOM_R, x0 = Math.round(x), z0 = Math.round(z), y0 = Math.floor(feet + 0.01);
    for (let dy = 1; dy <= DRAGON_FORM.ROOM_UP; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R) continue;
        const b = get(x0 + dx, y0 + dy, z0 + dz);
        if (b && !SOFT.has(b)) return false; // (leaves, flowers, crops: a dragon pushes through them)
    }
    return true;
}

const _v = new THREE.Vector3();

export class DragonForm {
    constructor(game) {
        this.game = game;
        this.id = null; // the dragon of my form
        this._ask = 0; // (a guest) when I asked the host
        this._hidden = false;
    }

    /** I am a dragon now (or on the way in). */
    get active() { return !!this.id && this.game.imperius?.name === 'DragonForm'; }

    /** Why it cannot be drunk now (null: it can). */
    cantNow() {
        const g = this.game, ch = g.character;
        if (!ch) return '🐉 Не сейчас';
        if (this.id) return null; // (drunk again: the time starts again)
        if (!g.dragons?.enabled) return '🐉 Здесь превращение не удаётся';
        if (g.isDeadLocal || g.combat?.dead) return '🐉 Не сейчас';
        if ((g.space?.realm && g.space.realm !== 'earth') || g.hellGate?.inHell) return '🐉 Здесь превращение не удаётся — драконы живут только на Земле';
        if (g.imperius?.name || g.imperius?.puppet) return '🐉 Сначала вернитесь в своё тело («стоп»)';
        if (g.monster?.active) return '🐉 Вы и так в чужом облике';
        if (g.animals?.riding || g.dragonRide?.busy || g.boards?.mounted || g.flight?.active || g.ships?.rigging?.climbing || g.ledge?.active || g.beds?.lying) return '🐉 Сначала встаньте на землю';
        if (ch.swimming || ch.swimY != null) return '🐉 Сначала выйдите из воды';
        if (g.ships?._shipUnder?.(ch.group.position, ch.group.position.y - PLAYER_GROUND_OFFSET)) return '🐉 На палубе дракону не поместиться — сойдите на берег';
        const t = g.terrain?.data;
        const feet = ch.group.position.y - PLAYER_GROUND_OFFSET;
        if (t && !roomFor((x, y, z) => t.get(x, y, z), ch.group.position.x, feet, ch.group.position.z)) return '🐉 Здесь тесно для дракона — выйдите на открытое место (не в пещере, не под крышей)';
        return null;
    }

    /** (PotionEffects.start) The potion drunk: the body becomes a dragon. */
    begin() {
        const g = this.game;
        if (this.id) return;
        if (g.authority) {
            const d = this._spawn(g.localId, g.character.group.position, g.character.group.rotation.y);
            if (!d) return;
            const r = g.imperius.claim('D', d.id, g.localId, 'DragonForm');
            g.imperius.onTaken('D', d.id, 'DragonForm', r);
            if (!r.ok) { this._drop(d); this.id = null; }
        } else {
            this._ask = Date.now();
            g.sync?.dragonForm?.({ e: 'ask' });
        }
        this._fx(g.character.group.position);
    }

    /** (host) A dragon for `by` at `pos`. */
    _spawn(by, pos, yaw) {
        const g = this.game, D = g.dragons;
        if (!D?.spawn) return null;
        const r = rollDragon(Math.random);
        const p = new THREE.Vector3(pos.x, pos.y - PLAYER_GROUND_OFFSET, pos.z);
        const d = D.spawn({ id: 'df' + Date.now().toString(36) + (by === g.localId ? '' : String(by).slice(-3)), kind: r.kind, react: r.react, flame: r.flame, hp: DRAGON_HP, pos: p, yaw, mode: 'fight' });
        d.form = by; // (whose body it is: no loot off it, no grudges, gone when the form ends)
        d.sleep = 0; d.fly = 0;
        if (by === g.localId) this.id = d.id;
        D._sendSoon = true;
        return d;
    }

    /** (host) The dragon of a form taken away (the form over). */
    _drop(d) {
        const D = this.game.dragons;
        if (!d || !D) return;
        this._fx(d.model.position);
        if (!d.dead) D._remove(d);
        D._sendSoon = true;
    }

    /** (the net) `dform` messages. */
    onNet(m, from) {
        const g = this.game;
        if (g.authority && m.e === 'ask') {
            const r = g.remotes?.get(from);
            if (!r?.position || g.dragons?.list.some((d) => d.form === from && !d.dead)) return;
            const d = this._spawn(from, r.position, r.character?.group?.rotation?.y || 0);
            if (!d) return;
            const ok = g.imperius.claim('D', d.id, from, 'DragonForm');
            g.sync?.imperius?.({ e: 'took', to: from, k: 'D', id: d.id, ok: ok.ok ? 1 : 0, say: ok.say || '', mx: 2 });
            if (!ok.ok) this._drop(d);
        } else if (g.authority && m.e === 'end') {
            const d = g.dragons?.list.find((x) => x.form === from);
            if (d) { g.imperius.unclaim('D', d.id); this._drop(d); }
        }
    }

    /** (a guest) The host's dragon is mine: wait till it is here, then the mind goes in. */
    took(id, ok, say) {
        const g = this.game;
        if (!this._ask) return;
        if (!ok) { this._ask = 0; if (say) g.hud?.setVoice?.(say, true); g.potionFx?.cancel?.('dragon'); return; }
        this._took = id;
    }

    /** (ImperiusControl._end) The mind is out of the dragon: the hero stands where it was. */
    ended(c) {
        const g = this.game, ch = g.character;
        if (!this.id && !this._wasId) return;
        const id = this.id || this._wasId;
        this.id = null; this._wasId = null; this._mark = null;
        const d = c || g.dragons?.list.find((x) => x.id === id);
        const p = d?.model?.position || ch.group.position;
        this._land(p.x, p.y + 2, p.z);
        this._show(true);
        if (d?.dead) { // (killed: out of it on the ground, shaken, half the health)
            const cb = g.combat;
            if (cb?.enabled && !cb.dead) cb.hp = Math.max(1, Math.round((cb.hp || 1) * DRAGON_FORM.HP_AFTER));
            else if (g.playerHP) g.playerHP = Math.max(1, Math.round(g.playerHP * DRAGON_FORM.HP_AFTER));
            cb?.stun?.(DRAGON_FORM.STUN, null, 'dragonForm');
            g.hud?.setVoice?.('🐉 Дракона убили — вы снова человек, но едва держитесь на ногах', true);
            g.potionFx?.cancel?.('dragon');
        } else g.hud?.setVoice?.('🐉 Превращение кончилось — вы снова человек', true);
        if (g.authority) { if (d) this._drop(d); } else g.sync?.dragonForm?.({ e: 'end' });
        this._fx(ch.group.position);
    }

    /** (PotionEffects._end / resetAll / death) The form ends now. */
    end() {
        const g = this.game;
        if (this.active) { g.imperius.stop('form'); return; } // (ImperiusControl.stop → _end → ended)
        if (this.id) { const id = this.id; this.id = null; this._wasId = id; this.ended(null); }
        this._ask = 0; this._took = null;
    }

    /** Every frame (after the creatures and ImperiusControl.update): the body carried inside the dragon, hidden. */
    update() {
        const g = this.game, ch = g.character;
        if (this._ask && !this.id) {
            if (this._took) {
                const d = g.dragons?.list.find((x) => x.id === this._took);
                if (d) {
                    this.id = d.id; this._ask = 0; this._took = null;
                    d.imp = { by: g.localId, mine: true, sys: 'D', name: 'DragonForm' };
                    d.form = g.localId;
                    g.imperius.onTaken('D', d.id, 'DragonForm', { ok: true });
                }
            }
            if (this._ask && Date.now() - this._ask > DRAGON_FORM.ASK_T) { this._ask = 0; this._took = null; g.hud?.setVoice?.('🐉 Превращение не удалось — попробуйте ещё раз', true); g.potionFx?.cancel?.('dragon'); }
        }
        if (!this.id) { if (this._hidden) this._show(true); return; }
        if (!this.active && !g.imperius?.name) { this.ended(null); return; } // (the mind is out some other way)
        const d = g.dragons?.list.find((x) => x.id === this.id);
        if (!d) return;
        this._show(false);
        // (how long yet: once a minute, and the last half minute — so the end never surprises in the air)
        const left = g.potionFx?.left?.dragon;
        if (left > 0) {
            const mark = left <= 30 ? -1 : Math.ceil(left / 60);
            if (mark !== this._mark) {
                if (this._mark != null) g.hud?.setVoice?.(mark === -1 ? '🐉 Через полминуты вы снова станете человеком — снижайтесь!' : `🐉 Драконом ещё ${mark} мин`, true);
                this._mark = mark;
            }
        }
        const p = d.model.position;
        ch.group.position.set(p.x, p.y + PLAYER_GROUND_OFFSET, p.z);
        ch.velocity?.set?.(0, 0, 0);
        ch.vy = 0;
    }

    /** The hero stands on the ground under (x, y, z) — never a fall out of the sky. */
    _land(x, y, z) {
        const g = this.game, ch = g.character, col = g.collision;
        const gy = col?.groundAt ? col.groundAt(x, z, y + 1) : (g.terrain?.data ? g.terrain.data.topLayer(Math.round(x), Math.round(z)) + 1 : y);
        ch.group.position.set(x, (Number.isFinite(gy) ? gy : y) + PLAYER_GROUND_OFFSET, z);
        ch.velocity?.set?.(0, 0, 0);
        ch.vy = 0;
        if (ch.fallFrom != null) ch.fallFrom = ch.group.position.y;
        if (ch.fallStart != null) ch.fallStart = ch.group.position.y;
    }

    /** Loaded in the form: on the ground; the form starts again. */
    restoreLanded() {
        const p = this.game.character?.group.position;
        if (p) this._land(p.x, p.y, p.z);
    }

    _show(on) {
        const ch = this.game.character;
        if (!ch) return;
        this._hidden = !on;
        ch.group.visible = on;
    }

    /** The turning: a swirl of ember and smoke. */
    _fx(p) {
        const g = this.game;
        for (let i = 0; i < 46; i++) {
            const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
            g.fx?.spark?.(_v.set(p.x, p.y - 0.5 + Math.random() * 3, p.z), i % 3 ? 0xff7a1e : 0x3a2a2a, 0.16, new THREE.Vector3(Math.cos(a) * s, 1 + Math.random() * 5, Math.sin(a) * s), 1.4);
        }
        g.sound?.playMagic?.(null, 1);
    }

    /** For my 'p' packet: the others see no hero (px bit 4). */
    netFlag() { return this.id ? 4 : 0; }
}
