/**
 * PlanetDestroy.js — «Planet Liquidation» («Планет Ликвидейшн», «Уничтожь планету»): a planet blown up. The sixth
 * scroll of the gods' library (the Temple of the Gods on Venus — GodsTemple.js); in Creative known at once and free.
 *
 *   Only in space: the raised hand (the wand) pointed at a planet (PlanetMagic._planetAimed — as «Enlarge Planet»,
 *   up to 80 km). A great beam of magic goes from the hand to the planet; for a few seconds the planet cracks, its
 *   red-hot core shines through the cracks, it shakes and swells — then it blows up: a flash, a ball of fire, the
 *   rings of the shock wave, the rocks flying apart (DoomView.js; the times — PlanetDoom.DOOM: 12 s to the blast).
 *   After: the planet is gone from the registry (the host; saved with the world, every computer gets it); on its
 *   orbit a new meteor cluster of its rocks (PlanetDoom.debrisCluster — «Create a Planet» can make a planet of it
 *   again; it is on the space map); its ground in the far zone is gone with it — what was built there too
 *   (TerrainView.planetGone; its slot is never given again). Whoever is on it or in its air at the blast dies (each
 *   computer its own player — warned all the while: «улетайте!»).
 *
 *   Price (the author): 1500 + the planet's mass — PlanetDoom.massCost: 1000 × √(mass in the Earth's masses):
 *   Pluto ~+120, the Moon ~+190, a planet of meteors ~+200, Mercury ~+350, Mars ~+420, Uranus ~+2200, Saturn ~+4000,
 *   Jupiter ~+6000. The price is shown in the space panel while the hand points at a planet (panelLine). Not
 *   enough mana — the sum is said, nothing happens. Creative: free.
 *   Not: the Earth and Venus («🛡️ Этот объект защищён силой богов» — the golden shield flashes on it), the Sun (a
 *   star, not a planet: no magic takes it). Everything else — the Moon, Mercury, Mars, the giants, Pluto, the
 *   planets players made — yes.
 *
 *   CONCENTRATION: an instant spell — the word said, the magic is let go and does the rest by itself (the beam, the
 *   cracking, the blast go on without the caster); nothing is held, another spell may be said at once.
 *   +100 mana cells the first time it works (Mana.GOD_SPELLS).
 *
 * На кого и на что (CLAUDE.md) — PlanetMagic.PLANET_TARGETS (.PlanetLiquidation): only a planet (a moon) — creatures
 * and things are never aimed at; who is on the planet or in its air dies with it (players: each computer its own;
 * no creatures live on other planets — Planets.earthly); nobody is pushed (Impact: null); the castles' people are not
 * afraid (it happens in space); the gods' gifts — the Earth, Venus (their temple) — untouched.
 *
 * Network: the cast is a planet change (Space.change: {doomAt, doomFrom, doomBy} — a guest asks the host); every
 * computer plays the same picture from doomAt (the shared clock); at doomAt + DOOM.T the host takes the planet out
 * (PlanetRegistry.remove + its debris) — saved, sent to everybody.
 */
import { manaRules } from './HeroSetup.js';
import { planetPosition, SPACE, slotAt, offEarth } from '../world/Planets.js';
import { DOOM, liquidationCost, liquidationRefusal, doomable, debrisCluster, GOD_PROTECTED } from '../world/PlanetDoom.js';
import { spaceSpellBlock } from './Space.js';

const _p = { x: 0, y: 0, z: 0 };

export class PlanetDestroy {
    constructor(game) {
        this.game = game;
        this._seen = new Map(); // `${id}:${doomAt}` -> {id, at, def, name, warn, rumble, boomed} (each planet dying, as I saw it)
        this._aimAt = 0; this._line = '';
        this._cast = null; // {side, until}: my beam along the hand
        this._voidAt = 0;
        this.log = []; // (tests) what happened
    }

    get space() { return this.game.space; }

    _side() {
        const g = this.game, ch = g.character;
        const side = g.wandSide?.() || [g.dom, g.off].find((s) => ch?.isArmRaised?.(s));
        return side && ch?.isArmRaised?.(side) ? side : null;
    }

    _say(text) { this.game.hud?.setVoice?.(text, true); return null; }

    /** Game._castLocalSpell (via PlanetMagic.cast). Returns 'PlanetLiquidation' when it works, else null (with a hint). */
    cast(isFinal = true) {
        if (!isFinal) return null; // (the gods' words: only the whole phrase)
        const g = this.game, S = this.space, pm = g.planetMagic;
        if (!S?.enabled) return this._say('🚫 На картах космоса нет — заклинания планет здесь не работают');
        const block = spaceSpellBlock('PlanetLiquidation', S.realm, null);
        if (block) return this._say(block);
        const side = this._side();
        if (!side) return this._say('✋ Поднимите руку (или палочку) и направьте её на планету');
        const aim = pm?._planetAimed(side, 'PlanetLiquidation');
        if (!aim?.def) return this._say('🪐 Направьте руку на планету — она должна быть видна и не дальше 80 км');
        const def = aim.def, t = S.now();
        const no = liquidationRefusal(def, t);
        if (no) {
            if (GOD_PROTECTED.has(def.id)) { // (the gods' golden shield flares on it — their protection is too strong)
                S.view?.doom?.flashShield(def.id, t);
                pm._beam(side, 0xffd060, 10);
                g.sound?.playSpace?.('spaceBeep', 0.9);
                this.log.push({ ev: 'shield', id: def.id });
                return this._say(`${no}: «${def.name}» — дар богов, никакая магия её не разрушит`);
            }
            return this._say(no);
        }
        const cost = liquidationCost(def);
        const tired = g.combat?.check?.('PlanetLiquidation', cost.mass);
        if (tired) {
            const have = Math.floor(g.combat?.fatigue ?? 0), need = g.combat?.costOf?.('PlanetLiquidation', cost.mass) ?? cost.total;
            return this._say(manaRules(g) && have < need ? `😮‍💨 «Planet Liquidation» на «${def.name}»: нужно ${cost.base} + ${cost.mass} (масса планеты) = ${need} маны, а у вас ${have}` : tired);
        }
        g.combat?.pay?.('PlanetLiquidation', cost.mass);
        S.change(def.id, { doomAt: t, doomFrom: [Math.round(S.P.x), Math.round(S.P.y), Math.round(S.P.z)], doomBy: pm._me() });
        pm._beam(side, 0xff3d8b, 30);
        g.sound?.playSpace?.('doomBeam', 1.1);
        this._mineAt = t;
        this._cast = { side, until: performance.now() + DOOM.BEAM * 1000 };
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.5);
        this._say(`💥 <b>Planet Liquidation!</b> Огромная магия летит в «${def.name}» (${cost.base} + ${cost.mass} = ${cost.total} маны). Планета трескается… через ${DOOM.T} секунд от неё останутся только обломки`);
        pm._worked('PlanetLiquidation');
        this.log.push({ ev: 'cast', id: def.id, cost: cost.total });
        if (this.log.length > 30) this.log.shift();
        return 'PlanetLiquidation';
    }

    /**
     * The gods' shield («Protection Gods», ProtectionGods.js) over me as the planet blows up: a spell of the gods —
     * it holds, for half of what this «Planet Liquidation» cost (1500 + the planet's mass) — the whole blow; then
     * the blast throws me out into space (the ground is gone). Out of mana: it breaks and the blast kills.
     */
    _godsHold(r) {
        const g = this.game, c = g.combat;
        if (!c?.shield?.gods) return false;
        if (c.godsHit('PlanetLiquidation', null, 1, liquidationCost(r.def).total) > 0) return false;
        try { if (this.space.realm === r.id) this.space._enterSpace(r.id); } catch (e) { console.warn('[PlanetLiquidation] out into space', e); }
        this._say(`✨ Божественная защита выдержала взрыв «${r.name}» — вас отбросило в космос`);
        return true;
    }

    /** Am I on the planet or in its air (over it, near its ground)? */
    _inDanger(r, t) {
        const g = this.game, S = this.space;
        if (g.combat?.dead || g.isDeadLocal) return false;
        if (S.realm === r.id) return true;
        if (S.realm !== 'space') return false;
        planetPosition(r.def, t, _p, S.planets);
        return Math.hypot(S.P.x - _p.x, S.P.y - _p.y, S.P.z - _p.z) - r.def.radius < DOOM.KILL_AIR + r.def.radius * 0.5;
    }

    /** Every frame (Game): the warnings, the sounds, the blast (killing who is on it), the host's taking it away. */
    update(dt) {
        const g = this.game, S = this.space;
        if (!S?.enabled) return;
        const t = S.now();
        for (const def of S.planets.list) {
            if (!def.doomAt || !doomable(def)) continue;
            const key = `${def.id}:${def.doomAt}`;
            const r = this._seen.get(key);
            if (r) r.def = { ...def };
            else if (t - def.doomAt < DOOM.T + 5) this._seen.set(key, { id: def.id, at: def.doomAt, def: { ...def }, name: def.name, warn: -1, beam: false, rumble: false, boomed: false });
        }
        const near = (r) => { if (S.realm === r.id) return 1; if (S.realm !== 'space') return 0; planetPosition(r.def, t, _p, S.planets); const d = Math.hypot(S.P.x - _p.x, S.P.y - _p.y, S.P.z - _p.z); return Math.max(0.3, Math.min(1.3, 1.4 - d / 120000)); };
        for (const [key, r] of this._seen) {
            const a = t - r.at;
            if (a < 0) continue;
            if (a > DOOM.T + DOOM.AFTER + 5) { this._seen.delete(key); continue; }
            const v = near(r);
            if (!r.beam && a < 2) { r.beam = true; if (v && r.at !== this._mineAt) g.sound?.playSpace?.('doomBeam', v); } // (my own: played at the cast)
            if (!r.rumble && a >= DOOM.CRACK0 && a < DOOM.T) { r.rumble = true; if (v) g.sound?.playSpace?.('doomRumble', v); }
            const danger = this._inDanger(r, t);
            if (a < DOOM.T) {
                if (danger) {
                    const left = Math.ceil(DOOM.T - a), step = Math.floor((DOOM.T - a) / DOOM.WARN);
                    if (step !== r.warn) {
                        r.warn = step;
                        this._say(`⚠️ <b>«${r.name}» сейчас взорвётся!</b> Улетайте как можно дальше${S.realm === 'space' ? '' : ' — «Флайн», потом «Flying Maxima»'}! Осталось ${left} с`);
                        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.25 + 0.5 * (a / DOOM.T));
                    }
                }
            } else if (!r.boomed) {
                r.boomed = true;
                if (a < DOOM.T + 3) { // (seen as it happens — not a blast long over, from a save)
                    if (v) { g.sound?.playSpace?.('doomBlast', Math.min(1.4, v + 0.2)); if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.4 + 0.6 * v); }
                    if (danger && this._godsHold(r)) { /* held by the gods' shield: thrown out into space alive */ }
                    else if (danger) S._die(`💥 Вы погибли вместе с планетой «${r.name}»: её взорвали заклинанием «Planet Liquidation»`);
                    else if (v) this._say(`💥 «${r.name}» взорвана! На её орбите — обломки (скопление метеоритов): из них можно снова создать планету («Create a Planet»)`);
                }
                this.log.push({ ev: 'blast', id: r.id });
            }
        }
        // the host: a planet whose blast came is taken out of the registry (also one found so in a save)
        if (g.authority) {
            for (const def of [...S.planets.list]) {
                if (!def.doomAt || !doomable(def) || t - def.doomAt < DOOM.T) continue;
                const at = def.doomAt + DOOM.T;
                S.planets.remove(def.id, debrisCluster(def, at, S.planets), at);
                this.log.push({ ev: 'gone', id: def.id });
            }
        }
        // my beam along the hand while it flies (the game's own scene: sparks)
        if (this._cast) {
            if (performance.now() > this._cast.until) this._cast = null;
            else if (Math.random() < 0.7) g.planetMagic?._beam(this._cast.side, Math.random() < 0.5 ? 0xff3d8b : 0xfff0f6, 3);
        }
        this._voidCheck();
    }

    /** Standing where a blown-up planet was (a save from before it, a lost moment): there is no ground there any more. */
    _voidCheck() {
        const g = this.game, S = this.space, now = performance.now();
        if (now - this._voidAt < 1000 || !S.planets.gone?.length || g.combat?.dead || g.isDeadLocal) return;
        this._voidAt = now;
        const p = g.character?.group?.position;
        if (!p || p.y >= SPACE.FLOOR_Y || !offEarth(p.x)) return;
        const s = slotAt(p.x, p.z), gone = s >= 0 && S.planets.gone.find((x) => x.slot === s);
        if (gone && !S.planets.bySlot(s)) S._die(`💥 Планеты «${gone.name}» больше нет — её взорвали заклинанием «Planet Liquidation»`);
    }

    /**
     * The line in the space panel (Space._panel; worked out 4 times a second): while the hand (the wand) points at a
     * planet and the spell is known — «💥 Planet Liquidation → «Марс»: 1500 + 420 = 1920 маны».
     */
    panelLine() {
        const now = performance.now();
        if (now - this._aimAt < 250) return this._line;
        this._aimAt = now;
        this._line = '';
        const g = this.game, S = this.space;
        if (S?.realm !== 'space' || g.isDeadLocal || g.combat?.dead || !g.knowsSpell?.('PlanetLiquidation')) return '';
        const side = this._side();
        const def = side ? g.planetMagic?._planetAimed(side, 'PlanetLiquidation')?.def : null;
        if (!def || def.kind === 'star') return '';
        const t = S.now();
        if (GOD_PROTECTED.has(def.id)) return (this._line = `🛡️ «${def.name}» защищена силой богов — «Planet Liquidation» её не возьмёт`);
        if (def.doomAt && t - def.doomAt < DOOM.T) return (this._line = `💥 «${def.name}» гибнет: взрыв через ${Math.max(0, Math.ceil(DOOM.T - (t - def.doomAt)))} с`);
        const c = liquidationCost(def), C = g.combat;
        if (!C?.enabled) return (this._line = `💥 Planet Liquidation → «${def.name}»: ${c.base} + ${c.mass} (масса) — в Творческом бесплатно`);
        const need = C.costOf ? C.costOf('PlanetLiquidation', c.mass) : c.total, have = Math.floor(C.fatigue ?? 0);
        this._line = `💥 Planet Liquidation → «${def.name}»: <b>${c.base} + ${c.mass} = ${need} маны</b>${have < need ? ` · <span style="color:#ff9a8a">не хватает ${need - have}</span>` : ''}`;
        return this._line;
    }

    dispose() { this._seen.clear(); this._cast = null; }
}
