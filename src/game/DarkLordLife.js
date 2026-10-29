/**
 * DarkLordLife.js — the game side of DarkLord.js: the turning into a true dark mage, the outfit, the curse, the cure, the world's answer.
 *
 * The turning: the dark level reaches 100 (`DarkHero.onGrow` → `onMax`; also on loading a save / taking the legacy back: level ≥ 100 and
 * not a dark mage yet). If a fight / a threat / sleep / water / a duel / the arena / another body (Imperius) / a fall hinders, it waits
 * (`blocker`), says so once and begins by itself when it is calm. Then, ~10 s: the big words «Вы стали настоящим тёмным магом», the hero
 * rises ~5 m and hangs there; a ball of darkness wound into a vortex round him (DarkLordFx), a rune circle on the ground, a tune, a rumble,
 * the people near are afraid; in the middle of it the outfit changes (the robe slot takes `lordRobe`: the old magic robe is absorbed with
 * its reserve), the «слом защиты» mark falls off; then he is let down gently.
 *
 * What it does on whom / what (CLAUDE.md): the hero only (the others see the rite, 'dlord'); it holds no concentration of its own but
 * ends every held spell at the start (`focus.lose('stun')` — the rite takes the mind), is not a spell (no mana), cannot be cast on.
 * «А если…» (each one handled):
 *  - the hero dies / the level drops before or during the rite → `onDeath`/`cancel`: the rite stops, nothing is half-done, the hero is let down;
 *  - he flies → hovering (`flight.pause`), after the rite flying goes on (`resume`); he is on a ship → the rise is relative (`dh` each frame);
 *  - the rite is not interrupted by anything: damage is ignored while it goes (the ball is the shield — `Combat` is told `invulnerable` via `lifting`);
 *  - two players turn at once → each has his own meshes and materials; a guest turning → his own computer runs it, the host only hears the people;
 *  - save/load in the middle: nothing is saved of the rite itself; on loading level ≥ 100 without an outfit — it begins again;
 *  - the outfit is saved by the armour (the robe item with `lord`) and by `snapshot()`; death keeps it in the legacy (`legacy()`), `absorbLegacy` puts it on.
 */

import * as THREE from 'three';
import { LORD, blocker, heightAt, TOTAL_T, SWAP_AT, lordRobe, unlordRobe, uncurse, BECAME_LINE, MARK_GONE_LINE, WAIT_LINE, cureRoll, cureWarning, reaction, LORD_LINES, lordPrice } from './DarkLord.js';
import { logLine } from './BumpRules.js';
import { DarkLordFx } from '../fx/DarkLordFx.js';
import { darkLevel, placeOf } from './DarkMagic.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { MANA } from './Mana.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const _v = new THREE.Vector3();
const HOSTILE_MS = 300000;
const RETRY_MS = 20000;

export class DarkLordLife {
    constructor(game) {
        this.game = game;
        this.on = false; // a true dark mage now (the outfit is on)
        this.want = false; // the level is 100: the turning is due (waits for calm)
        this.rite = null; // { t, h, ground, swapped, flying, id }
        this.fx = new DarkLordFx(game);
        this.remote = new Map(); // player id → { t, fx, x, y, z }
        this.since = 0; // s of play as a dark mage (the legacy keeps it)
        this._waitAt = -1e9;
        this._scanT = 0.5;
        this._tintT = 0;
        this._titleEl = null;
        this._warned = null; // the potion the warning was said for { uid, at }
        this.log = [];
    }

    /** The rite holds the body in the air: no gravity, no walking (Game: the 3rd argument of Character.update). */
    get lifting() { return !!this.rite; }

    /** Is this player (me, or a remote one in his outfit) a true dark mage? */
    isLord(pid) {
        const g = this.game;
        if (pid == null || pid === g.localId) return this.on;
        return !!g.remotes?.get?.(pid)?.character?.darkLord;
    }

    // ------------------------------------------------------------------ the trigger
    /** The level reached 100 (DarkHero.onGrow). */
    onMax() {
        if (!this.on && !this.rite) this.want = true;
    }

    /** What the game says now (for `blocker`). */
    sense() {
        const g = this.game, c = g.combat, ch = g.character;
        return {
            dead: !!(c?.dead || g.isDeadLocal),
            sleeping: !!g.beds?.lying,
            imperius: !!(g.imperius?.busy || g.imperius?.puppet),
            duel: !!g.duel?.underFire?.(),
            arena: !!g.arenaDuels?.mode,
            down: !!(g.knock?.down || g.monster?.active || g.animals?.riding || g.dragonRide?.busy || g.boards?.mounted || g.spiders?.held),
            lifted: !!g.levitation?.lifted,
            swimming: ch?.swimY != null,
            danger: this._danger() || (g.flight?.active && !g.flight.hovering && g.flight.state === 'takeoff'),
            sinceHit: (performance.now() - (c?.hurtAt || -1e9)) / 1000,
        };
    }

    /** A threat at hand: an awake zombie close, a villager at war with me, a dragon/spider in sight. */
    _danger() {
        const g = this.game, me = g.character?.group?.position;
        if (!me) return false;
        for (const z of g.zombies || []) {
            if (z.isDead || !z.group) continue;
            if (z.hunting && Math.hypot(z.group.position.x - me.x, z.group.position.z - me.z) < 28) return true;
        }
        const life = g.castleLife;
        if (life?.byId) for (const v of life.byId.values()) if (!v.dead && v.foe === g.localId && Math.hypot(v.x - me.x, v.z - me.z) < 60) return true;
        return false;
    }

    // ------------------------------------------------------------------ the rite
    update(dt) {
        const g = this.game;
        this._remotes(dt);
        const lvl = darkLevel(g.dark);
        if (!this.on && !this.rite && lvl >= LORD.LEVEL) this.want = true; // (a loaded world, the legacy taken back: still due)
        if (this.want && lvl < LORD.LEVEL) this.want = false;
        if (this.want && !this.on && !this.rite) {
            const why = blocker(this.sense());
            if (why === 'dead') { /* the respawn resets the level: nothing to do */ } else if (why) {
                const now = performance.now();
                if (now - this._waitAt > RETRY_MS) { this._waitAt = now; g.hud?.setVoice?.(`🜏 ${WAIT_LINE}`, true); this._note(`ждёт: ${why}`); }
            } else this._begin();
        }
        if (this.rite) this._riteStep(dt);
        if (this.on) {
            this.since += dt;
            this._tintT -= dt;
            if (this._tintT <= 0) {
                this._tintT = 0.5;
                this._tint();
                if (!this.rite && g.armor && !g.armor.worn.robe?.lord) this.become({ quiet: true }); // (the outfit was lost with a death in Creative, or by a broken save: it comes back — it is a part of him)
            }
            if (g.authority !== false) this._world(dt);
        }
        this._titleStep(dt);
    }

    _begin() {
        const g = this.game, ch = g.character, p = ch.group.position;
        this.want = false;
        this.rite = { t: 0, h: 0, ground: p.y - PLAYER_GROUND_OFFSET, swapped: false, flying: false, id: `${g.localId}:${Date.now().toString(36)}` };
        g.focus?.lose?.('stun'); // (the rite takes the mind: every held spell ends)
        if (g.flight?.active && g.flight.pause()) { this.rite.flying = true; } // (hovers; resumed at the end)
        g.sync?.darkLord?.({ k: 'begin', id: this.rite.id, p: [p.x, p.y, p.z] });
        this._title(BECAME_LINE);
        g.sound?.playSpellFxAt?.('thDarkLord', p, 1, 1, 70);
        this._note('превращение началось');
    }

    _riteStep(dt) {
        const g = this.game, ch = g.character, R = this.rite, p = ch.group.position;
        if (g.combat?.dead || g.isDeadLocal || darkLevel(g.dark) < LORD.LEVEL) { this.cancel('смерть или тьма ушла'); return; }
        R.t += dt;
        const h = heightAt(R.t), dh = h - R.h;
        R.h = h;
        p.y += dh;
        ch.verticalVelocity = 0; ch.onGround = false;
        g.knockback?.set?.(0, 0, 0);
        const center = _v.set(p.x, p.y, p.z);
        this.fx.update(dt, R.t, center, R.ground);
        if (!R.swapped && R.t >= SWAP_AT) { R.swapped = true; this._turn(); }
        if (Math.floor(R.t * 4) !== Math.floor((R.t - dt) * 4) && this.rite) g.sync?.darkLord?.({ k: 'at', id: R.id, p: [p.x, p.y, p.z], t: R.t });
        if (R.t >= TOTAL_T) this._finish();
    }

    /** In the middle of the dark: the clothes change, the mark falls off. */
    _turn() {
        const g = this.game;
        this.fx.swapBurst(g.character.group.position);
        g.sound?.playRumble?.(g.character.group.position, g.character.group.position);
        g.castleLife?.alarm?.(g.character.group.position.clone(), 'dark', g.localId, 30); // (the people near see something dreadful; they run from the dark)
        this.become({ quiet: false });
    }

    /**
     * He is a dark mage now: the outfit, the mark gone, the wand dark. `old` — a robe to absorb (the legacy gives its own); `quiet` — no words.
     */
    become({ quiet = false, robe = null } = {}) {
        const g = this.game, A = g.armor;
        this.on = true; this.want = false;
        if (A) {
            const old = robe || A.worn.robe;
            if (old?.archmage) { A._stow?.(old); A.worn.robe = null; } // (the High Mage's suit goes into a slot; it comes back with the cure)
            A.worn.robe = lordRobe(old && !old.archmage ? old : null, `lord-${g.localId || 'me'}`);
            for (const s of ['helmet', 'chest', 'legs']) if (A.worn[s]) A.worn[s].cursed = true; // (what he wears turns black from now on)
            A._changed();
        }
        if (g.breakward?.marked) { g.breakward.marked = false; g.breakward.bar?.reset?.(); g.breakward._shown = ''; g.breakward._hud?.(); if (!quiet) g.hud?.setVoice?.(`🜏 ${MARK_GONE_LINE}`, true); }
        this._tint(true);
        g.combat && (g.combat._hudKey = '');
        this._note('тёмный маг: наряд надет');
    }

    _finish() {
        const g = this.game, R = this.rite;
        this.rite = null;
        this.fx.stop();
        if (R?.flying) g.flight?.resume?.();
        if (g.impact) g.impact.gentleUntil = performance.now() + 2500; // (set down gently: no fall-over)
        g.sync?.darkLord?.({ k: 'end', id: R?.id });
        g.hud?.setVoice?.('🜏 Тьма стала вашей. Мантию тёмного мага теперь не снять — пока на вас проклятие.', true);
    }

    /** The rite is torn off (death, the level fell): nothing is left half-done. */
    cancel(why = '') {
        const g = this.game, R = this.rite;
        if (!R) return;
        this.rite = null;
        this.fx.stop();
        if (R.flying) g.flight?.resume?.();
        if (g.impact) g.impact.gentleUntil = performance.now() + 2500;
        g.sync?.darkLord?.({ k: 'end', id: R.id });
        if (this.on && darkLevel(g.dark) < LORD.LEVEL) this.undress(true);
        this._note(`прервано: ${why}`);
    }

    // ------------------------------------------------------------------ the curse is lifted
    /** The cure worked (or the potion's effect): the level, the curse, the outfit, the marks go. */
    lift() {
        const g = this.game;
        this.undress(false);
        if (g.dark) { g.dark.level = 0; g.dark.skin = 0; g.dark.onClean?.(); }
        this.want = false;
        g.hud?.setVoice?.('✨ Проклятие тёмного мага снято. Вы снова можете снять любую вещь.', true);
    }

    /** The outfit goes back to what it was (the absorbed robe plain again, a robe the curse gave is gone), the armour stops being black. */
    undress(quiet = false) {
        const g = this.game, A = g.armor;
        this.on = false;
        if (A) {
            A.worn.robe = unlordRobe(A.worn.robe);
            for (const s of ['helmet', 'chest', 'legs']) uncurse(A.worn[s]);
            A._changed();
            for (const sl of g.inventory?.slots || []) if (sl?.cursed) uncurse(sl);
            for (const side of ['right', 'left']) { const it = g.items?.held?.[side]?.item; if (it?.cursed) uncurse(it); }
        }
        this._untint();
        void quiet;
        this._note('наряд снят');
    }

    /** The robe he wore as a thing (the legacy keeps it: absorbed magic and all). */
    legacy() {
        if (!this.on) return null;
        const r = this.game.armor?.worn?.robe;
        let robe = null; // (only a robe he really had is kept: the one the curse gave him is not a thing)
        if (r?.lord && r.was?.absorbed) { robe = { ...r, color: r.was.color ?? 0 }; delete robe.lord; delete robe.was; }
        return { on: 1, robe, since: Math.round(this.since) };
    }

    // ------------------------------------------------------------------ the wand
    /** The wand in a hand turns dark (the shape and the powers are the same; only the colour): checked twice a second. */
    _tint(force = false) {
        const g = this.game, it = g.items;
        if (!it?.held) return;
        for (const side of ['right', 'left']) {
            const h = it.held[side];
            if (!h || h.item?.kind !== 'wand' || !h.model) continue;
            if (!force && h.model.userData.darkLord) continue;
            darken(h.model);
        }
    }

    _untint() {
        const it = this.game.items;
        for (const side of ['right', 'left']) lighten(it?.held?.[side]?.model);
    }

    // ------------------------------------------------------------------ the cure
    /**
     * The potion at the mouth. First time: the warning, the flask stays. Second time (within a minute): drunk.
     * @returns {'warn'|'drink'|'none'} what happened; 'drink' tells the caller to finish the flask
     */
    drinkCure(item) {
        const g = this.game;
        const cells = g.combat?.maxFatigue ?? MANA.BASE;
        const uid = item.uid;
        const now = performance.now();
        if (!this.on && darkLevel(g.dark) <= 0) { g.hud?.setVoice?.('🧪 На вас нет проклятия тёмного мага — зелье не нужно', true); return 'none'; }
        if (this._warned?.uid !== uid || now - this._warned.at > 60000) {
            this._warned = { uid, at: now, away: false };
            g.hud?.setVoice?.(`🧪 ⚠ ${cureWarning(cells)}`, true);
            return 'warn';
        }
        if (!this._warned.away) return 'none'; // (still at the mouth after the warning: the flask must be taken away and brought back — it is a choice, not a reflex)
        this._warned = null;
        const res = cureRoll(cells, Math.random);
        if (res.cost > 0) this._spendCells(res.cost);
        if (res.ok) {
            this.lift();
        } else {
            g.hud?.setVoice?.(res.chance <= 0 ? '🧪 Зелье не подействовало: ячеек маны слишком мало. Проклятие осталось.' : `🧪 Зелье выпито, но проклятие не отпустило (шанс был ${Math.round(res.chance * 100)} %). Ячейки потрачены.`, true);
        }
        return 'drink';
    }

    /** The flask is away from the mouth (Items._eat): the next time at the mouth drinks it. */
    mouthFree() { if (this._warned) this._warned.away = true; }

    /** The cells of mana (the maximum) go: first what the practice grew, then the scrolls' gift; never below the base. */
    _spendCells(n) {
        const g = this.game, c = g.combat, M = g.mana;
        if (!c) return;
        const take = Math.max(0, Math.min(n, (c.maxFatigue || MANA.BASE) - MANA.BASE));
        let left = take;
        if (M && M.growth > 0) { const d = Math.min(M.growth, left); M.growth -= d; left -= d; }
        const B = g.bonus;
        if (left > 0 && B?.fatigue > 0) { const d = Math.min(B.fatigue, left); B.fatigue -= d; left -= d; }
        c.maxFatigue = Math.max(MANA.BASE, (c.maxFatigue || MANA.BASE) - take);
        c.fatigue = Math.min(c.fatigue, c.maxFatigue);
        c._hudKey = '';
    }

    // ------------------------------------------------------------------ the world
    /** Who are the dark mages near (the hero, and the other players in their outfit): [{ id, pos }]. */
    _lords() {
        const g = this.game, out = [];
        if (this.on && g.character?.group) out.push({ id: g.localId, pos: g.character.group.position });
        for (const [id, r] of g.remotes || []) if (r?.character?.darkLord && r.character.group) out.push({ id, pos: r.character.group.position });
        return out;
    }

    /** (host) The people who see a dark mage: knights and town wizards strike, the rest run; traders handle it in the talk (CastleTalk._darkGate). */
    _world(dt) {
        this._scanT -= dt;
        if (this._scanT > 0) return;
        this._scanT = LORD.SCAN_S;
        const g = this.game, life = g.castleLife;
        if (!life?.enabled || !life.auth || !life.castles) return;
        const lords = this._lords();
        if (!lords.length) return;
        const now = Date.now();
        for (const L of lords) {
            for (const cs of life.castles.values()) {
                if (!cs.awake || !cs.active) continue;
                const st = life.state(cs.def.id);
                if (st.owner === L.id || (life.rankOf && life.rankOf(cs, L.id) >= 1)) continue; // (his own subjects, the king's friends: no)
                if (Math.hypot(cs.def.x - L.pos.x, cs.def.z - L.pos.z) > 400) continue;
                for (const v of cs.active.values()) {
                    if (v.dead || v.sleep || v.servantOf != null || v.stunT > 0) continue;
                    if (Math.hypot(v.x - L.pos.x, v.z - L.pos.z) > LORD.SEE_R) continue;
                    if (now - (v.lordAt || 0) < 20000) continue;
                    if (life._sees && !life._sees(v, L.pos)) continue; // (a wall hides him: nobody sees through it)
                    const re = reaction({ role: v.role, id: v.id, wizard: !!v.wizard, wanderer: v.role === 'wanderer' }, v.wizard ? placeOf(cs.def, v.entry) : null);
                    if (re.do === 'attack') {
                        v.lordAt = now;
                        cs.hostile.set(L.id, now + HOSTILE_MS);
                        if (life._fights?.(v) && !v.foe) { v.foe = L.id; v.grudge = { id: L.id, until: now + 120000 }; v.path = null; }
                        life._say?.(v, pick(LORD_LINES.attack), 3);
                    } else if (re.do === 'flee') {
                        v.lordAt = now;
                        life.fright?.scare?.(v, 'dark', { x: L.pos.x, y: L.pos.y - PLAYER_GROUND_OFFSET, z: L.pos.z }, L.id);
                        if (Math.random() < 0.5) life._say?.(v, pick(LORD_LINES.flee), 3);
                    }
                }
            }
        }
    }

    /** The price multiplier a dark mage pays at this trader (1: none). */
    priceMult(v, trader, pid = null) {
        if (!this.isLord(pid) || !v || !trader) return 1;
        const re = reaction({ role: v.role, id: v.id, wizard: !!v.wizard, wanderer: v.role === 'wanderer' }, v.wizard ? placeOf(v.cs?.def, v.entry) : null);
        return (re.do === 'trade' || re.do === 'scorn') && !re.refuse && re.mult ? re.mult : 1;
    }

    priceFor(v, trader, price, pid = null) { const m = this.priceMult(v, trader, pid); return m === 1 ? price : lordPrice(price, v.id); }

    /** Does this villager want nothing to do with a dark mage (a trader who refuses, one who runs, one who strikes)? → { say } or null. */
    shuns(v) {
        if (!this.on || !v) return null;
        const re = reaction({ role: v.role, id: v.id, wizard: !!v.wizard, wanderer: v.role === 'wanderer' }, v.wizard ? placeOf(v.cs?.def, v.entry) : null);
        if (re.do === 'attack') return { say: pick(LORD_LINES.attack), do: 'attack' };
        if (re.do === 'flee') return { say: pick(LORD_LINES.flee), do: 'flee' };
        if ((re.do === 'trade' || re.do === 'scorn') && re.refuse) return { say: pick(LORD_LINES.refuse), do: 'refuse' };
        if (re.do === 'scorn' || re.do === 'trade') return { say: pick(LORD_LINES.scorn.concat(LORD_LINES.sell)), do: 'sell', soft: true };
        return null;
    }

    // ------------------------------------------------------------------ the others' rites
    onNet(by, m) {
        if (!by || by === this.game.localId) return;
        if (m.k === 'begin' || m.k === 'at') {
            let r = this.remote.get(by);
            if (!r || r.id !== m.id) {
                r?.fx.dispose();
                r = { id: m.id, t: Number(m.t) || 0, fx: new DarkLordFx(this.game), at: performance.now(), ground: Number(m.p?.[1]) - PLAYER_GROUND_OFFSET };
                this.remote.set(by, r);
                this.game.sound?.playSpellFxAt?.('thDarkLord', _v.fromArray(m.p || [0, 0, 0]), 1, 1, 70);
            }
            if (Array.isArray(m.p) && m.p.every(Number.isFinite)) r.pos = m.p.slice(0, 3);
            if (Number.isFinite(+m.t)) r.t = Math.max(r.t, +m.t);
            r.at = performance.now();
        } else if (m.k === 'end') {
            const r = this.remote.get(by);
            if (r) { r.fx.stop(); r.fx.dispose(); this.remote.delete(by); }
        }
    }

    _remotes(dt) {
        if (!this.remote.size) return;
        const now = performance.now();
        for (const [id, r] of this.remote) {
            const av = this.game.remotes?.get?.(id);
            if (!av || now - r.at > 6000 || r.t > TOTAL_T + 1) { r.fx.stop(); r.fx.dispose(); this.remote.delete(id); continue; }
            r.t += dt;
            const c = av.character.group.position;
            r.fx.update(dt, r.t, _v.set(c.x, c.y, c.z), r.ground);
        }
    }

    // ------------------------------------------------------------------ the words on the screen
    _title(text) {
        if (typeof document === 'undefined') return;
        let el = this._titleEl;
        if (!el) {
            el = this._titleEl = document.createElement('div');
            el.style.cssText = 'position:fixed;left:50%;top:30%;transform:translate(-50%,-50%) scale(.92);z-index:62;pointer-events:none;max-width:90vw;text-align:center;'
                + 'font:900 64px/1.15 Georgia,serif;letter-spacing:2px;color:#d9c2ff;text-shadow:0 0 22px #7a2be0,0 0 48px #3a0a7a,0 4px 12px #000;opacity:0;transition:opacity 1.2s, transform 3s';
            document.body.appendChild(el);
        }
        el.textContent = text;
        requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translate(-50%,-50%) scale(1.04)'; });
        this._titleT = LORD.T_TEXT;
    }

    _titleStep(dt) {
        if (!(this._titleT > 0)) return;
        this._titleT -= dt;
        if (this._titleT <= 0 && this._titleEl) { this._titleEl.style.opacity = '0'; this._titleEl.style.transform = 'translate(-50%,-50%) scale(1.1)'; }
    }

    // ------------------------------------------------------------------ the save, death
    snapshot() { return this.on ? { on: 1, t: Math.round(this.since) } : null; }

    /** From a save (the outfit itself is in the armour's list; this only says that he is one) or from the legacy (`rec.robe` — the robe to absorb). */
    restore(s, { fromLegacy = false } = {}) {
        if (!s || !s.on) { if (this.on && !fromLegacy) this.on = false; return; }
        this.since = Math.max(0, +s.t || +s.since || 0);
        const A = this.game.armor;
        if (fromLegacy || !A?.worn?.robe?.lord) this.become({ quiet: true, robe: fromLegacy ? s.robe || null : null });
        else { this.on = true; this._tint(true); }
    }

    /** Death: everything of the dark mage goes (the legacy holds it). */
    onDeath() {
        const A = this.game.armor;
        const was = this.on;
        this.on = false; this.want = false; this.since = 0; // (before `cancel`: it must not undress him — the robe is taken below)
        this.cancel('смерть');
        // (the outfit is gone with the power — it is in the legacy, not on the ground: the absorbed robe must not be twice in the world)
        if (A?.worn?.robe?.lord) { A.worn.robe = null; A._changed?.(); }
        if (was) for (const s of ['helmet', 'chest', 'legs']) uncurse(A?.worn?.[s]);
        this._untint();
        this._warned = null;
    }

    _note(text) { this.log.push(text); if (this.log.length > 30) this.log.shift(); logLine(`тёмный маг: ${text}`); }

    dispose() {
        this.fx.dispose();
        for (const r of this.remote.values()) r.fx.dispose();
        this.remote.clear();
        this._titleEl?.remove();
    }
}

// ------------------------------------------------------------------ the dark paint for a model (a wand in a hand)
const _dark = new Map(); // original material uuid → its dark copy (a few shared materials: bounded)

function darkCopy(m) {
    let d = _dark.get(m.uuid);
    if (!d) {
        if (_dark.size > 64) _dark.clear();
        d = m.clone();
        if (d.color) d.color.setHex(LORD.WAND_COLOR).lerp(new THREE.Color(LORD.WAND_TRIM), m.isMeshBasicMaterial ? 0.55 : 0.12);
        if (d.emissive) d.emissive.setHex(0x1a0830);
        d.userData = { ...(d.userData || {}), shared: true, darkOf: m.uuid };
        _dark.set(m.uuid, d);
    }
    return d;
}

/** Wand model → dark (keeps the originals so it can be undone). */
export function darken(model) {
    if (!model || model.userData.darkLord) return;
    const orig = new Map();
    model.traverse((o) => {
        if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
        orig.set(o, o.material);
        o.material = darkCopy(o.material);
    });
    model.userData.darkLord = orig;
}

export function lighten(model) {
    const orig = model?.userData?.darkLord;
    if (!orig) return;
    for (const [o, m] of orig) o.material = m;
    delete model.userData.darkLord;
}
