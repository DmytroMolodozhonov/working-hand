/**
 * Invisibility.js — «Invisibility» (only from a scroll): the caster can't be seen.
 *
 * The wand is turned at oneself — or raised up (a tracked hand turned back at the chest is seen
 * badly by the camera: WandAim.js) — and «Invisible» / «Invisibility» is said: 20 mana at once, then
 * 1 every second. Gone when the mana is gone, or by «стоп».
 *   - I see myself a little — as if a bit invisible (the body and what the hands hold, faint).
 *   - The others see nothing of me: other players (their computers hide my hero, what my hands hold,
 *     my name), every creature's mind (villagers, knights, wizards, sailors, zombies, animals, the
 *     spider, dragons, phoenixes): they don't see me. They only know about where I was when I did
 *     something (a spell, a blow) — they go there and strike at it — and soon lose me.
 *   - My spells are seen anyway — by the players and by the people of the castles.
 *
 * Who decides: my computer (it pays, it says on / off to everybody: 'invis'); every computer hides
 * an invisible player's hero; the host's creatures ask `aiPos` where a player is.
 */

import * as THREE from 'three';
import { aimedUpOrSelf, castingHand } from './WandAim.js';

export const INVIS = {
    COST: 20, // mana at once (Combat.SPELL_COST)
    DRAIN: 1, // mana a second
    CLUE_T: 4, // s the creatures remember where they last noticed me
    CLUE_NOISE: 1.5, // m: «примерно»
    SELF_OPACITY: 0.28, // how much of myself I see
};

/**
 * Where the minds of the world think a player is: `pos` while they are seen; while invisible — the
 * place they were last noticed at (a spell, a blow) for CLUE_T s, then nowhere (null). Pure.
 */
export function cluePos(hidden, pos, clue, now) {
    if (!hidden) return pos;
    if (clue && now < clue.until) return clue.pos;
    return null;
}

/** ON WHOM AND ON WHAT (CLAUDE.md). `does`: blind | none | show. */
export const INVIS_TARGETS = {
    me: { does: 'show', why: 'себя вижу чуть-чуть, полупрозрачно (тело и то, что в руках)' },
    players: { does: 'blind', why: 'другие игроки не видят ни меня, ни того, что у меня в руках, ни имени; на миникарте меня нет' },
    zombies: { does: 'blind', why: 'теряют цель; идут к месту, где я что-то сделал, и быстро теряют' },
    castlePeople: { does: 'blind', why: 'жители, рыцари, король, волшебники не видят: стража идёт к месту, где заметили заклинание или удар, и теряет' },
    animals: { does: 'blind', why: 'не видят — не убегают и не нападают (быки, минотавр)' },
    sailors: { does: 'blind', why: 'моряки не видят меня на палубе; идут к последнему месту' },
    spider: { does: 'blind', why: 'паучиха теряет меня' },
    livingTrees: { does: 'blind', why: 'чужое живое дерево не находит меня (ищет через того же «игрока»)' },
    bookBirds: { does: 'none', why: 'книги-птицы и так не охотятся на игроков' },
    dragon: { does: 'blind', why: 'дракон теряет меня; огонь, которым я колдую, — видит' },
    iceCastle: { does: 'blind', why: 'королева, её монстры и снеговики не видят меня — только где я был, когда ударил или колдовал' },
    blackship: { does: 'blind', why: 'чёрный корабль, его капитан и скелеты не видят меня: не стреляют и не идут на абордаж — только туда, где я колдовал' },
    phoenix: { does: 'blind', why: 'феникс не видит, не лечит и не нападает' },
    owl: { does: 'blind', why: 'сова не видит невидимого: не смотрит на него и не слышит его просьбу' },
    servants: { does: 'none', why: 'мои слуги меня знают и идут за мной' },
    spells: { does: 'show', why: 'мои заклинания видны всем — игрокам и жителям: место заклинания выдаёт меня на 4 секунды' },
    hits: { does: 'show', why: 'удар по существу выдаёт место — на 4 секунды' },
    bosses: { does: 'none', why: 'БОССЫ видят невидимого — это их способность: король, глава башни волшебников, паучиха, дракон, Ледяная Королева, капитан Чёрные Усы; при первом обнаружении кричат «Думаешь, я тебя не вижу?» (кто умеет говорить)' },
    things: { does: 'none', why: 'вещи, двери, корабли — невидимость касается только меня' },
};

/** The bosses see the invisible: this is what they cry out when they find the player out (BOSS_SEES). */
export const BOSS_LINES = ['Думаешь, я тебя не вижу?', 'Твоя невидимость тебе не поможет!'];
export const BOSS = { SEE_R: 45, AGAIN_T: 40 }; // m: how near a boss must be to cry out; s between its cries at the same player

/**
 * Pure: should boss `key` cry out now at player `id` (first time it sees them under invisibility, then once in
 * a while)? `seen` is a Map (key|id → time of the last cry). It also forgets the old ones.
 */
export function bossCries(seen, key, id, now) {
    const k = key + '|' + id, last = seen.get(k);
    if (seen.size > 40) for (const [kk, t] of seen) if (now - t > BOSS.AGAIN_T * 1000) seen.delete(kk);
    if (last != null && now - last < BOSS.AGAIN_T * 1000) return false;
    seen.set(k, now);
    return true;
}

const _v = new THREE.Vector3();

export class Invisibility {
    constructor(game) {
        this.game = game;
        this.on = false;
        this.others = new Map(); // playerId → true (invisible)
        this.clues = new Map(); // playerId → {pos, until}
        this._faded = []; // [{m, transparent, opacity, depthWrite}]
    }

    /** Is this player invisible now? */
    hidden(id) {
        const g = this.game;
        if (id === g.localId || id === 'local') return this.on;
        return !!this.others.get(id);
    }

    /** Where the creatures of the world think player `id` is (see cluePos). */
    aiPos(id, pos, boss = null) {
        if (!pos) return pos;
        if (boss && this.hidden(id)) { this._bossSees(id, pos, boss); return pos; } // (a boss sees through it)
        return cluePos(this.hidden(id), pos, this.clues.get(id), performance.now());
    }

    /**
     * A boss looks at the invisible player `id`: it sees them anyway and, near enough, cries out once in a while.
     * `boss`: true (a creature without speech: spiders, dragons) or {key, x, z, say(text)}.
     */
    _bossSees(id, pos, boss) {
        if (boss === true || !boss.say) return;
        if (boss.x != null && Math.hypot(pos.x - boss.x, pos.z - boss.z) > BOSS.SEE_R) return;
        if (!this._bossSeen) this._bossSeen = new Map();
        if (bossCries(this._bossSeen, boss.key, id, performance.now())) boss.say(BOSS_LINES[Math.floor(Math.random() * BOSS_LINES.length)]);
    }

    /** Player `id` did something seen (a spell, a blow): the world knows about where. */
    noted(id) {
        if (!this.hidden(id)) return;
        const g = this.game;
        const p = id === g.localId || id === 'local' ? g.character?.group.position : g.remotes?.get(id)?.position;
        if (!p) return;
        const a = Math.random() * Math.PI * 2, r = Math.random() * INVIS.CLUE_NOISE;
        this.clues.set(id, { pos: new THREE.Vector3(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r), until: performance.now() + INVIS.CLUE_T * 1000 });
    }

    /** Voice on my computer. */
    cast(isFinal) {
        const g = this.game;
        if (this.on) { if (isFinal) g.hud.setVoice('👻 Вы и так невидимы. «Стоп» — снять невидимость', true); return null; }
        const hand = castingHand(g);
        if (!hand || !aimedUpOrSelf(g, hand)) {
            if (isFinal) g.hud.setVoice('👻 Направьте палочку на себя (или поднимите её вверх) и скажите «Invisible»', true);
            return null;
        }
        const tired = g.combat.check('Invisibility');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Invisibility');
        // a shimmer runs down the body as it fades
        const c = g.combat.center(new THREE.Vector3());
        for (let i = 0; i < 30; i++) g.fx.spark(_v.set(c.x + (Math.random() - 0.5) * 0.8, c.y + 0.8 - Math.random() * 1.8, c.z + (Math.random() - 0.5) * 0.8), i % 2 ? 0xdfe9ff : 0x9fb6ff, 0.06, new THREE.Vector3(0, -0.6, 0), 0.6);
        this.set(true);
        g.hud.setVoice('👻 Вы невидимы — 1 мана в секунду. «Стоп» — снять', true);
        return 'Invisibility';
    }

    /** On / off on my computer (and told to everybody). */
    set(on, why = null) {
        const g = this.game;
        if (this.on === on) return;
        this.on = on;
        this._fade(on);
        g.sync?.invis?.(on);
        if (!on) {
            this.clues.delete(g.localId);
            if (why === 'mana') g.hud.setVoice('👻 Мана кончилась — вас снова видно', true);
            else if (why === 'stop') g.hud.setVoice('👻 Невидимость снята', true);
        }
    }

    /** «стоп»: true when it was on. */
    stop() {
        if (!this.on) return false;
        this.set(false);
        return true;
    }

    /** Another player went invisible / visible ('invis'). */
    onNet(by, on) {
        if (by === this.game.localId) return;
        if (on) this.others.set(by, true);
        else { this.others.delete(by); this.clues.delete(by); }
    }

    update(dt) {
        const g = this.game;
        if (this.on) {
            if (g.combat?.dead || g.isDeadLocal) this.set(false);
            else if (g.combat?.drain(INVIS.DRAIN * dt, dt) === false) this.set(false, 'mana');
            else {
                this._fadeHeld();
                // (said again now and then: a player who joined later knows too)
                this._netT = (this._netT || 0) - dt;
                if (this._netT <= 0) { this._netT = 5; g.sync?.invis?.(true); }
            }
        }
        // the others' heroes, what their hands hold and the blades in them: not drawn while invisible
        for (const [id, r] of g.remotes || []) {
            const hide = !!this.others.get(id);
            if (hide) { r.character.group.visible = false; r._invisHidden = true; }
            else if (r._invisHidden) { r._invisHidden = false; r.character.group.visible = !r.dead; }
            const held = g.items?.remoteHeld?.get(id);
            if (held) for (const k of Object.keys(held)) if (held[k]?.model) held[k].model.visible = !hide;
        }
        if (this.others.size) {
            const owners = g.sync?.weaponOwners;
            for (const w of g.weapons?.weapons || []) {
                if (!w.remoteTarget || !owners) continue;
                const hide = !!this.others.get(owners.get(w.id));
                if (w.mesh) w.mesh.visible = !hide;
            }
        }
    }

    /** I see myself a little: the body (and what my hands hold) faint. */
    _fade(on) {
        const g = this.game;
        if (!on) {
            for (const f of this._faded) { f.m.transparent = f.transparent; f.m.opacity = f.opacity; f.m.depthWrite = f.depthWrite; f.m.needsUpdate = true; }
            this._faded = [];
            this._seen = null;
            return;
        }
        const seen = new Set();
        const take = (root) => root?.traverse?.((o) => {
            const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
            for (const m of mats) {
                if (seen.has(m)) continue;
                seen.add(m);
                this._faded.push({ m, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
                m.transparent = true; m.opacity = (m.opacity ?? 1) * INVIS.SELF_OPACITY; m.depthWrite = false; m.needsUpdate = true;
            }
        });
        take(g.character?.group);
        this._seen = seen;
        this._fadeHeld();
    }

    /** (a thing taken into the hand while invisible fades too) */
    _fadeHeld() {
        const g = this.game, seen = this._seen;
        if (!seen) return;
        for (const s of ['left', 'right']) {
            g.items?.held?.[s]?.model?.traverse?.((o) => {
                const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
                for (const m of mats) {
                    if (seen.has(m)) continue;
                    seen.add(m);
                    this._faded.push({ m, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
                    m.transparent = true; m.opacity = (m.opacity ?? 1) * INVIS.SELF_OPACITY; m.depthWrite = false; m.needsUpdate = true;
                }
            });
        }
    }
}
