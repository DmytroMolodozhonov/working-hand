/**
 * Space.js — «Космос»: Flying Maxima, the flight out of the Earth's air into the Solar System, the
 * planets, the way back. The game system (THREE); the planets' data: src/world/Planets.js (read its
 * header: the API for the other «Космос» sessions — the Gods' temple on Venus, the planet spells).
 *
 *   1. 1000 mana cells (any way: practice, achievements, «Высший маг», crystals, scrolls): once —
 *      «Поздравляем! Вы приблизились к силе богов» and «Flying Maxima» is learnt (kept with the hero,
 *      game.bonus.spells.FlyingMaxima). In Creative it is known at once.
 *   2. Only in flight (after «Флайн»): «Flying Maxima» — the hero shoots straight up, faster and
 *      faster; the sky darkens, the stars come out, clouds rush down past, a white-out — and he is
 *      above the round Earth, going on out of its orbit (state ascend → space).
 *   3. Space: the same flight by the body (lean to turn, forward / back to dive / climb, «Паузин» to
 *      hover, «Флайн» on), faster and faster — the speed held down near a planet. Breathing in space
 *      takes magic: −0.5 mana a second (the free world's mana; none comes back meanwhile); no mana left —
 *      you suffocate (a few seconds to get back into air, then death). The Sun: the heat grows, a
 *      warning — and close to it everybody dies, in any mode, with any protection.
 *   4. Back: fly into a planet with ground (the Earth, the Moon, Mercury, Venus, Mars, Pluto) — the air
 *      burns round you (state entry), then you are over the very place you flew at (descend) and fly on
 *      as usual. On the Earth that is anywhere in the world (a quick way to travel). Gas giants have no
 *      ground: the clouds' pressure throws you back out.
 *   5. Other planets: their own ground (PlanetSurface.js), gravity, sky; no air on the Moon, Mercury,
 *      Pluto and Mars (thin) — the breathing magic goes on; Venus has air (not toxic here: the author) but
 *      storms — strong wind, dust, lightning far off. «Flying Maxima» there takes you back to space.
 *
 * Where the hero is: the realm comes from the position alone (Planets.realmAt). In space his true place
 * is `P` (heliocentric, metres, doubles); in the world he stays near SPACE.ANCHOR (an empty spot between
 * the planets' slots) at A + (P − O), O moved along now and then (floating origin): the ground under him
 * is never made, everything round him stays precise.
 *
 * Who / what × how (CLAUDE.md) — off the Earth (spellBlocked below has the list, each with its reason):
 *   - fire needs air: Inferno, Fire, Fire Maxima, Hellfire don't burn in space, on the Moon, Mercury, Pluto
 *     or thin Mars (Venus: they do); lightning needs clouds (only Venus); water spells: no water (in space
 *     it would freeze at once); wind spells: no air to blow (Venus: yes); building and the ground's
 *     spells need ground (on the planets: yes — the same voxels); creatures: none live off the Earth.
 *   - creatures never come to space: dragons, phoenixes, Pegasus fly only under the sky (their own
 *     flights never go above it); riding one, Flying Maxima is refused («спешьтесь»).
 *   - players: each sees the others in space and on the planets (their positions say where); duel
 *     charges, shields, Lumos work everywhere (charges fly on in the void).
 *   - things let go in space float on with the speed they had (Items: no fall above SPACE.FLOOR_Y).
 *   - the gods' gifts are not touched by any of this; nothing here breaks blocks except on purpose.
 * The host decides the planets (game.space.planets — saved with the world); every computer flies its
 * own hero (positions go as always).
 */
import * as THREE from 'three';
import { SPACE, PLANETS, planetPosition, spinAt, realmAt, surfaceToDir, dirToSurface, earthToDir, dirToEarth, slotRect, PlanetRegistry } from '../world/Planets.js';
import { SpaceView, VIEW_FX } from '../world/SpaceView.js';
import { clamp, smoothstep } from '../core/math.js';
import { chunkKey, CHUNK } from '../world/Terrain.js';
import { FLIGHT } from './Flight.js';

export const FLYMAX = {
    UNLOCK: 1000, // mana cells
    BREATH: 0.5, // mana a second to breathe without air
    FLY: 1.5, // mana a second «Flying Maxima» takes while it carries the hero (the climb, space, the burning air: the author)
    SUFFOCATE: 6, // s without mana before death
    EARTH_TOP: 440, // the climb ends (and space begins) this high over the Earth (world y)
    PLANET_TOP: 300, // … over another planet's ground
    ENTRY_T: 1.7, // s of burning air (planets with air); 0.8 without
    DESC_H: 240, // m over the ground after the fall into the air (Earth); planets: 160
    MAX_SPEED: 18000, // m/s far out (the speed near a planet is held down by its distance)
    SOI: 5, // a planet carries a hero within this many radii (+1500 m) along its orbit
};

/** «Flying Maxima» in Russian and English, as the recognizer hears it (SpellManager calls this first). */
export function flyingMaximaWords(s) {
    const fly = /(флайн|флаин|флайинг|флаинг|флайэнг|флаенг|флайм|flying|fly|flai|полёт|полет)/.test(s);
    const max = /(макс|max|мах|maks|мекс|мэкс)/.test(s);
    return fly && max;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _pc = { x: 0, y: 0, z: 0 }; // (a meteor cluster's place: _clusterAlt)
const _p = { x: 0, y: 0, z: 0 }, _p2 = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 }, _s = { x: 0, z: 0 };
const A = { x: SPACE.ANCHOR_X, y: SPACE.ORIGIN_Y, z: SPACE.ANCHOR_Z };
/** «Terraform Planet» seen on the planet (shares of VIEW_FX.TERRA): the waves of light, its air, its land remade. */
export const TERRA_STAGE = { WAVES: 0.12, AIR: 0.45, LAND: 0.5 };
const EPOCH = 1.79e9; // (the shared clock: seconds since then — the same on every computer)

/**
 * Spells off the Earth: why one does not work here (or null). air: 'space' | 'none' | 'air'.
 * def: the planet (a terraformed one in the green zone has water and clouds — PlanetMagic.js; Venus and the
 * giants have storm clouds: lightning and rain have something to come from).
 */
export function spaceSpellBlock(name, where, air, def = null) {
    // («Planet Liquidation» — only from space: from the ground one cannot aim at a whole planet — PlanetDestroy.js)
    if (name === 'PlanetLiquidation' && where !== 'space') return where === 'earth' ? '🌌 «Planet Liquidation» — только в космосе: взлетите «Flying Maxima» и наведите руку на планету' : '🌌 «Planet Liquidation» — только из космоса: стоя на планете, её не взорвать (взлетите «Flying Maxima» и наведите руку на неё)';
    if (where === 'earth') return null;
    // («Brain Rot Maxima»: the dragons live on the Earth alone — Planets.earthly; off it there is nobody to calm — DragonTame.js)
    if (name === 'BrainrotMaxima') return '🐉 Драконы живут только на Земле — здесь «Брейнрот Максима» некого успокоить';
    // («Strengthen House»: the spheres of houses are the Earth's — in space and on every planet there is none to feed; HouseWards.js)
    if (name === 'StrengthenHouse') return '🛡️ Здесь нет защиты дома — нечего усиливать';
    if (name === 'WardDispel') return '🌌 Здесь нет защиты дома — нечего снимать';
    if (def?.terraformed && def.climate === 'green' && /^(LightningStrike|LetItRain|Thunderwave|Waterball|WaterForming|WaterVortex|WaterVortexSuperMaxima|Firefighting|FirefightingMaxima|AirBubble|AirBubbleMaxima|WaveAttack|WaveAttackMaxima|Frozen|Drawdown|DrawdownMaxima)$/.test(name)) return null;
    const vacuum = where === 'space' || air === 'none';
    const clouds = where === 'venus' || !!def?.storms || def?.kind === 'gas';
    const base = (name || '').replace(/Maxima$/, '');
    if (/^(Inferno|Fire|Hellfire|FireMaxima)$/.test(name) || base === 'Fire') {
        if (vacuum) return where === 'space' ? '🔥 В космосе нет воздуха — огонь не горит' : '🔥 Здесь нет воздуха — огонь не горит';
    }
    if (/^(LightningStrike|LetItRain|Thunderwave)$/.test(name) && !clouds) return '⛈️ Здесь нет туч — молнии и дождю неоткуда взяться';
    if (/^(Wind|WindMaxima|WindImpulse|WindImpulseMaxima|Unfurl|Furl)$/.test(name) && vacuum) return '🌬️ Без воздуха ветру нечем дуть';
    if (/^(Waterball|WaterForming|WaterVortex|WaterVortexSuperMaxima|Firefighting|FirefightingMaxima|AirBubble|AirBubbleMaxima|WaveAttack|WaveAttackMaxima|Drawdown|DrawdownMaxima)$/.test(name)) {
        return where === 'space' ? '💧 В космосе вода мгновенно замерзает — водяная магия не работает' : '💧 Здесь нет воды';
    }
    if (where === 'space') {
        // (nothing under the feet: no ground to raise, build on or shake; nobody to command)
        // («Бум» tears a mountain or a castle from inside: in open space there is none — on a planet it works as at home, air or no air)
        if (name === 'Boom') return '💥 В открытом космосе нет ни горы, ни замка — «Бум» нечего разорвать изнутри';
        // («Империус»: in open space there is no creature to go into; on a planet it works on whoever is there)
        if (name === 'Imperius' || name === 'ImperiusMaxima') return '🌌 В открытом космосе нет существ — вселиться не в кого';
        if (/^(Earthquake|EarthquakeMaxima|Breakthrough|BreakthroughMaxima|WallRise|WallRiseMaxima|Gather|CreateFloor|CreateWall|CreateCeiling|BuildRoof|CreateDoor|CreateBed|CreateBoard|CreateHouse|ImproveHouse|CreateCastle|IceCastle|IceBridge|Liquidation|LiquidationMaxima|Stitching|CreateBridge|Groundprud|Pentagranium|GroundVortex|GroundShield|Overgrown|OvergrownMaxima|Alive|AliveMaxima|Snowman|TotalDestruction|TotalDestructionMaxima|CircleAttack|CircleAttackMaxima|Inspirius|ToTheSun|LevitationMaxima|Brainrot|Attack|Rescue|ProtectionHouse|Up|Bombardo|BombardoMaxima)$/.test(name)) return '🌌 В космосе под ногами ничего нет — это заклинание здесь не на что направить';
    }
    return null;
}

export class Space {
    constructor(game) {
        this.game = game;
        const data = game.world?.terrain?.data;
        this.enabled = !!(data && data.mountains);
        this.planets = data?.planets || new PlanetRegistry(game.seed || 1);
        this.state = 'off'; // off | ascend | space | entry | descend
        this.P = { x: 0, y: 0, z: 0 }; // where the hero is in space (heliocentric)
        this.O = { x: 0, y: 0, z: 0 }; // the floating origin (world A = space O)
        this.vel = { x: 0, y: 0, z: 0 };
        this.speed = 0;
        this.yaw = 0; this.pitch = 0;
        this.realm = 'earth';
        this._last = new THREE.Vector3();
        this._prev = new Map(); // body id -> its position last frame (a planet carries a hero along)
        this.suffocate = 0;
        this.heat = 0;
        this.view = null;
        this._tex = new Map(); // body id -> 'asked' | 'done'
        this._msgAt = {};
        this._dom = null;
        this._windT = 0; this._boltT = 3;
        this._soundsReady = false;
        if (this.enabled && game.renderer && typeof document !== 'undefined') this.view = new SpaceView(this.planets);
        this.planets.onChange(() => this._planetsChanged());
    }

    /** The shared clock (s): the planets are where they are on every computer. */
    now() { return Date.now() / 1000 - EPOCH + (this.game.net?.clockOffset || 0) / 1000 + (this.timeShift || 0); }

    get offEarth() { return this.realm !== 'earth'; }
    get inSpace() { return this.realm === 'space'; }
    /** Space's flight runs instead of the plain «Флайн» one (Game._updatePlayer). */
    get handles() { return this.state !== 'off' || this.realm === 'space'; }

    /** Is «Flying Maxima» known? (Creative: always; elsewhere: given at 1000 mana cells.) */
    knows() {
        const m = this.game.config?.mode;
        return m === 'creative' || m === 'test' || !!this.game.bonus?.spells?.FlyingMaxima;
    }

    // ─────────────────────────────────────────────────────────────── the gift at 1000 cells
    /**
     * Every second or so: the hero reached 1000 mana cells — the gods' gift, once. «Flying Maxima» is a spell of the
     * gods (Mana.GOD_SPELLS; the lore — LoreBooks.js): no scroll, no shop, no chest — only given to a truly strong wizard.
     */
    checkUnlock() {
        const g = this.game;
        const m = g.config?.mode;
        if (m === 'creative' || m === 'test' || g.bonus?.spells?.FlyingMaxima) return false;
        const max = g.combat?.maxFatigue || 30;
        if (max < FLYMAX.UNLOCK) return false;
        g.bonus = g.bonus || {};
        g.bonus.spells = { ...(g.bonus.spells || {}), FlyingMaxima: true };
        const title = '✨ Поздравляем, вы приблизились к силе богов!';
        const sub = 'Боги даруют вам своё заклинание «Flying Maxima» — его нельзя найти или купить, только получить в дар. В полёте скажите его — и летите вверх, за небо, в космос';
        if (g.achievements?._banner) g.achievements._banner(title, sub, true);
        else g.hud?.notify?.(`${title} ${sub}`, 8000);
        g.hud?.setVoice?.(`${title}<br>${sub}`, true);
        g.sound?.playSpace?.('spaceGift', 1);
        const p = g.character.group.position;
        for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.2;
            g.fx?.spark?.(_v1.set(p.x + Math.cos(a) * r, p.y - 1 + Math.random() * 3, p.z + Math.sin(a) * r), i % 3 ? 0xfff2b0 : 0x9fd8ff, 0.18, _v2.set(0, 2 + Math.random() * 4, 0), 1.6);
        }
        this.prepare();
        return true;
    }

    /** Get ready (the planets' maps in a worker, the sounds): once the spell is known. */
    prepare() {
        if (this._prepared || !this.enabled) return;
        this._prepared = true;
        this._askTextures();
    }

    // ─────────────────────────────────────────────────────────────── casting
    /** «Flying Maxima» said (Game._castLocalSpell). Returns the spell name when it works, else null. */
    cast(isFinal = true) {
        const g = this.game;
        const say = (t) => { if (isFinal) g.hud?.setVoice?.(t, true); return null; };
        if (!this.enabled) return say('🚫 На картах в космос не улететь');
        if (!this.knows()) return say('✨ «Flying Maxima» откроется, когда у вас будет 1000 ячеек маны');
        if (this.state === 'space' || this.realm === 'space') {
            // (in space: one more burst of speed)
            this.speed = Math.max(this.speed, this._speedCap() * 0.9);
            g.flight.resume?.();
            if (isFinal) g.hud?.setVoice?.('🚀 Flying Maxima — полный вперёд!', true);
            return 'FlyingMaxima';
        }
        if (this.state !== 'off') return null;
        if (!g.flight.active || g.flight.state !== 'cruise') return say('🦸 «Flying Maxima» — только в полёте: сначала взлетите («Флайн»), потом скажите «Flying Maxima»');
        if (g.animals?.riding) return say('🐴 Звери не летают выше неба — сначала спешьтесь');
        if (g.dragonRide?.busy) return say('🐉 На драконе выше неба не взлететь — сначала слезьте');
        const p = g.character.group.position;
        if (g.collision?.ceilingAt && g.collision.ceilingAt(p.x, p.z, p.y + 1) !== Infinity) return say('🧱 Над вами крыша — вылетите под открытое небо');
        this.state = 'ascend';
        this._t = 0;
        this._v = Math.max(14, g.flight.speed * 0.6);
        this._from = this.realm;
        this._y0 = p.y;
        const gy = this._ground(p.x, p.z);
        this._top = this.realm === 'earth' ? Math.max(FLYMAX.EARTH_TOP, p.y + 200) : Math.max(p.y + 120, gy + FLYMAX.PLANET_TOP);
        g.flight.hovering = false;
        this.prepare();
        g.sound?.playSpace?.('spaceRise', 1);
        g.fx?.lightFlash?.(p, 0xbfe4ff, 2, 0.5, 40);
        if (isFinal) g.hud?.setVoice?.('🚀 <b>Flying Maxima!</b> Вы уходите вверх — к звёздам…', true);
        return 'FlyingMaxima';
    }

    /** Spells off the Earth: a reason it does not work here, or null (Game._castLocalSpell). */
    spellBlocked(name) {
        if (!this.offEarth) return null;
        const def = this.planets.get(this.realm);
        return spaceSpellBlock(name, this.realm, this.realm === 'space' ? 'space' : breathable(def) ? 'air' : 'none', def);
    }

    // ─────────────────────────────────────────────────────────────── the frame
    /** Before the hero moves: which world he is in (and its gravity). */
    beginFrame() {
        const g = this.game, p = g.character.group.position;
        const was = this.realm;
        this.realm = this.enabled ? realmAt(p.x, p.y, p.z, this.planets) : 'earth';
        const def = this.planets.get(this.realm);
        g.character.gravityK = def && this.realm !== 'earth' && this.realm !== 'space' ? def.gravity : 1;
        if (was !== this.realm) this._realmChanged(was);
        g.character.setBodyHidden?.(this.realm === 'space'); // (looking down in space: space, not one's own back)
        if (!this._soundsReady && this._prepared && g.sound?.prepareSpace) this._soundsReady = g.sound.prepareSpace();
    }

    _realmChanged(was) {
        const g = this.game;
        if ((this.realm === 'space') !== (was === 'space')) g.sound?.spaceQuiet?.(this.realm === 'space'); // (the silence of space)
        if (this.realm === 'earth' && was !== 'earth') this._restoreEarthSky();
        if (this.realm !== 'space' && this.realm !== 'earth') {
            const def = this.planets.get(this.realm);
            this._say(`🪐 ${def?.name || 'Планета'}: ${planetLine(def)}`, 'land' + this.realm, 7000);
            g.sound?.playSpace?.('spaceBeep', 0.8);
            this._found(this.realm);
        }
        if (this.realm === 'earth' && was !== 'earth' && was !== 'space') this._say('🌍 Вы снова дома, на Земле', 'home', 4000);
        if (this.realm === 'space' && this.state === 'off') {
            // (back in a saved game, or pushed up there: the hero floats)
            this.state = 'space';
            if (!g.flight.active) g.flight.float();
        }
        if (this.realm === 'space') g.mana?.discover?.('space');
    }

    /** A planet entered (into its air, down to it) the first time this life: +50 cells, an achievement (Mana.discover). */
    _found(id) {
        if (!id || id === 'earth' || id === 'space' || id === 'sun') return;
        this.game.mana?.discover?.('planet:' + id, this.planets.get(id)?.name);
    }

    /**
     * The hero's own movement while Space has it (Game._updatePlayer calls this instead of the plain flight).
     */
    update(dt, pose) {
        const g = this.game;
        if (this.state === 'ascend') return this._ascend(dt);
        if (this.state === 'descend') return this._descend(dt, pose);
        if (this.realm === 'space' || this.state === 'space' || this.state === 'entry') return this._fly(dt, pose);
        g._updateFlight(dt, pose);
    }

    _ascend(dt) {
        const g = this.game, ch = g.character, p = ch.group.position, fl = g.flight;
        this._t += dt;
        if (!this.testHold) { // (pictures, tests: held where it is)
            this._v = Math.min(900, this._v + (24 + this._v * 1.15) * dt);
            p.y += this._v * dt;
        }
        ch.flying = true;
        fl.tilt += (0.12 - fl.tilt) * Math.min(1, dt * 3);
        ch.setFlightTilt(fl.tilt);
        ch.head.rotation.x = g.smoothHead.pitch + fl.tilt;
        ch.flightView = 0;
        const k = clamp((p.y - this._y0) / Math.max(1, this._top - this._y0), 0, 1);
        this.climbK = k;
        g.fx.shake = Math.max(g.fx.shake || 0, 0.15 * k);
        this._overlay(this._from === 'earth' || this.planets.get(this._from)?.air === 'air' ? 'white' : 'black', smoothstep(0.8, 1, k));
        if (p.y >= this._top) this._enterSpace(this._from);
    }

    /** Out of the air: above the planet left, going on away from it. */
    _enterSpace(from) {
        const g = this.game, p = g.character.group.position;
        const t = this.now();
        const def = this.planets.get(from === 'earth' ? 'earth' : from) || this.planets.get('earth');
        planetPosition(def, t, _p, this.planets);
        if (from === 'earth') earthToDir(p.x, p.z, _d);
        else { surfaceToDir(def, p.x, p.z, _d); toSpace(_d, def, t); }
        const R = def.radius;
        this.P.x = _p.x + _d.x * (R + 45); this.P.y = _p.y + _d.y * (R + 45); this.P.z = _p.z + _d.z * (R + 45);
        this.O.x = this.P.x; this.O.y = this.P.y; this.O.z = this.P.z;
        const v = Math.max(260, this._v || 300);
        this.vel.x = _d.x * v; this.vel.y = _d.y * v; this.vel.z = _d.z * v;
        this.speed = v;
        this._exitDir = { x: _d.x, y: _d.y, z: _d.z };
        this._exitT = 0;
        this.yaw = g.character.group.rotation.y;
        this.pitch = 0;
        if (from === 'earth') this.earthBack = { x: p.x, z: p.z };
        p.set(A.x, A.y, A.z);
        this._last.copy(p);
        this.state = 'space';
        this.realm = 'space';
        const fl = g.flight;
        if (!fl.active) fl.float();
        fl.hovering = false;
        this._prev.clear();
        this._ovKind = this._from === 'earth' || this.planets.get(this._from)?.air === 'air' ? 'white' : 'black'; this._ovK = 1; // (the white-out clears by itself)
        const mana = g.combat?.enabled;
        g.mana?.discover?.('space'); // (the first time out: the achievement, +20 cells)
        this._say(mana ? '🌌 Вы в космосе! Магия дыхания: <b>−0,5 маны в секунду</b> — без неё здесь не выжить, и сам полёт — <b>Flying Maxima −1,5</b> и «Флайн» <b>−2,5 маны в секунду</b> (зависнуть — −1,8). Кончится мана — вернитесь в воздух' : '🌌 Вы в космосе!', 'enter', 7000);
    }

    /** The hero in space: his flight by the body, the planets, the Sun. */
    _fly(dt, pose) {
        const g = this.game, ch = g.character, p = ch.group.position, fl = g.flight;
        const t = this.now();
        if (!fl.active) fl.float(); // (a «стоп», a stun: in space one just floats)
        // what moved me besides my flight (a blast, a shove, Leviosa): it moves my place in space too
        const dx = p.x - this._last.x, dy = p.y - this._last.y, dz = p.z - this._last.z;
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 60) { this.P.x += dx; this.P.y += dy; this.P.z += dz; }
        // a planet carries the hero near it along its orbit (the Moon round the Earth too)
        const near = this._nearest(t);
        if (near && near.def.id !== 'sun' && near.def.id !== this.noCarry) { // (noCarry: the planet I drag myself — PlanetMagic)
            const pv = this._prev.get(near.def.id);
            if (pv && near.alt < near.def.radius * FLYMAX.SOI + 1500) { this.P.x += near.pos.x - pv.x; this.P.y += near.pos.y - pv.y; this.P.z += near.pos.z - pv.z; }
        }
        for (const b of this._bodies) { const q = this._prev.get(b.def.id) || {}; q.x = b.pos.x; q.y = b.pos.y; q.z = b.pos.z; this._prev.set(b.def.id, q); }

        // steering by the body as in «Флайн»: lean sideways to turn, forward / back to dive / climb. The look
        // does NOT steer here (the author: looking down turned the whole flight down — hard to look anywhere):
        // the head looks freely round the way one flies; the flight drifts a little after a steady look (below)
        if (!fl.neutral && pose?.torso) fl._calibrate(pose.torso); // (floated without a take-off: the calm pose now)
        const steer = fl.steering(pose ? pose.torso : null, 0);
        const yawRate = steer.turn * 1.5;
        if (yawRate) {
            if (g.settings.drifting) g.cameraBaseRotation += yawRate * dt; else g.smoothBody += yawRate * dt;
            ch.setBodyRotation(g.settings.drifting ? g.cameraBaseRotation : g.smoothBody);
        }
        this.yaw = ch.group.rotation.y;
        this.pitch = clamp(this.pitch - steer.dive * 1.3 * dt, -1.45, 1.45);
        if (this.state === 'entry') return this._entry(dt, t, near);

        // speed: faster and faster; held down near a planet (its distance) — «Паузин» stops
        const cap = this._speedCap(near);
        if (fl.hovering) this.speed *= Math.exp(-2.5 * dt);
        else if (this.speed < cap) this.speed = Math.min(cap, this.speed + (30 + this.speed * 0.55) * dt);
        else this.speed = cap + (this.speed - cap) * Math.exp(-3 * dt);
        // where it goes: the look of the body (out of the Earth's air at first: straight away from it)
        const cp = Math.cos(this.pitch);
        let hx = -Math.sin(this.yaw) * cp, hy = Math.sin(this.pitch), hz = -Math.cos(this.yaw) * cp;
        if (this._exitDir && this._exitT < 3.5) {
            this._exitT += dt;
            const k = smoothstep(2.0, 3.5, this._exitT);
            hx = this._exitDir.x * (1 - k) + hx * k; hy = this._exitDir.y * (1 - k) + hy * k; hz = this._exitDir.z * (1 - k) + hz * k;
            const l = Math.hypot(hx, hy, hz) || 1; hx /= l; hy /= l; hz /= l;
            if (!fl.hovering) this.speed = Math.max(this.speed, 300 + this._exitT * 500);
        } else this._exitDir = null;
        // where one looks pulls the course a little: half-way toward the look when it is near ahead, nothing
        // when looking aside, down or back (so one can look round without the flight turning — and without
        // the view turning on its own: the body's course is not changed, only the way one drifts)
        if (!this._exitDir && g.camera) {
            g.camera.getWorldDirection(_v1);
            const dot = _v1.x * hx + _v1.y * hy + _v1.z * hz;
            const k = 0.5 * smoothstep(Math.cos(1.3), Math.cos(0.6), dot);
            if (k > 0) { hx += (_v1.x - hx) * k; hy += (_v1.y - hy) * k; hz += (_v1.z - hz) * k; const l = Math.hypot(hx, hy, hz) || 1; hx /= l; hy /= l; hz /= l; }
        }
        const ki = 1 - Math.exp(-2.2 * dt); // (a little drift: space has no air to turn against)
        this.vel.x += (hx * this.speed - this.vel.x) * ki;
        this.vel.y += (hy * this.speed - this.vel.y) * ki;
        this.vel.z += (hz * this.speed - this.vel.z) * ki;
        this.P.x += this.vel.x * dt; this.P.y += this.vel.y * dt; this.P.z += this.vel.z * dt;

        this._bodiesCheck(dt, t, near);
        this._place();

        // the body: Superman when going fast, upright hovering
        const tiltT = fl.hovering ? 0.15 : 1.35 - Math.max(0, this.pitch) * 0.5;
        fl.tilt += clamp(tiltT - fl.tilt, -1.2 * dt, 1.2 * dt);
        fl.pitch = this.pitch;
        ch.flying = true;
        ch.setFlightTilt(fl.tilt);
        const view = clamp(this.pitch, -1.3, 1.1);
        ch.head.rotation.x = g.smoothHead.pitch + fl.tilt + view;
        // (and the head turns sideways as it is turned: looking round, even behind, while the course holds)
        ch.head.rotation.y = g._headBase?.yaw ?? 0;
        ch.flightView = view;
        // speed lines (the dust of space rushing past)
        if (this.speed > 60 && g.cameraMode === 'fpv' && !fl.hovering) {
            const n = this.speed > 2000 ? 3 : 1;
            for (let i = 0; i < n; i++) {
                _v1.set(p.x + hx * 14 + (Math.random() - 0.5) * 12, p.y + 1.5 + hy * 14 + (Math.random() - 0.5) * 8, p.z + hz * 14 + (Math.random() - 0.5) * 12);
                g.fx.spark(_v1, 0xcfe4ff, 0.05, _v2.set(-hx * 60, -hy * 60, -hz * 60), 0.35);
            }
        }
    }

    /** Where the hero is put in the world: near the anchor, P − O from it (O follows when he gets far). */
    _place() {
        const g = this.game, p = g.character.group.position, F = SPACE.FLOAT;
        if (Math.abs(this.P.x - this.O.x) > F || Math.abs(this.P.y - this.O.y) > F || Math.abs(this.P.z - this.O.z) > F) {
            // the origin moves to me: the things floating in space round me move with it (they keep their place in space)
            const sx = this.O.x - this.P.x, sy = this.O.y - this.P.y, sz = this.O.z - this.P.z;
            this.O.x = this.P.x; this.O.y = this.P.y; this.O.z = this.P.z;
            this._shiftLocal(sx, sy, sz);
        }
        p.set(A.x + (this.P.x - this.O.x), A.y + (this.P.y - this.O.y), A.z + (this.P.z - this.O.z));
        this._last.copy(p);
    }

    /** Things let go in space (Items, weapons) keep their place in space when the origin moves. */
    _shiftLocal(dx, dy, dz) {
        const g = this.game;
        for (const L of g.items?.loose?.values?.() || []) { const q = L.model?.position; if (q && q.y > SPACE.FLOOR_Y) { q.x += dx; q.y += dy; q.z += dz; } }
        for (const w of g.weapons?.weapons || []) { if (!w.holder && w.position?.y > SPACE.FLOOR_Y) { w.position.x += dx; w.position.y += dy; w.position.z += dz; } }
    }

    /** The speed allowed here: slow near a planet's ground, very fast far out. */
    _speedCap(near = this._nearest(this.now())) {
        const d = Math.min(near ? near.alt : 1e6, this._clusterAlt());
        return clamp(d * 0.75 + 80, 80, FLYMAX.MAX_SPEED);
    }

    /**
     * How far the nearest free meteor cluster's edge is (m): near one the flight slows down as near a planet —
     * the author flew through them too fast to stop and point the hand («Create a Planet», PlanetMagic.js).
     */
    _clusterAlt() {
        let best = 1e9;
        const t = this.now();
        for (const c of this.planets.clusters) {
            if (c.used) continue;
            planetPosition(c, t, _pc);
            const d = Math.hypot(this.P.x - _pc.x, this.P.y - _pc.y, this.P.z - _pc.z) - c.r;
            if (d < best) best = d;
        }
        return Math.max(0, best);
    }

    /** Every body's place now and the nearest one's ground (alt: metres above it). */
    _nearest(t) {
        const out = this._bodies || (this._bodies = []);
        const list = this.planets.list;
        out.length = list.length;
        let best = null;
        for (let i = 0; i < list.length; i++) {
            const def = list[i];
            const b = out[i] || (out[i] = { def: null, pos: { x: 0, y: 0, z: 0 }, dist: 0, alt: 0 }); // (kept: no garbage a frame)
            b.def = def;
            planetPosition(def, t, b.pos, this.planets);
            b.dist = Math.hypot(this.P.x - b.pos.x, this.P.y - b.pos.y, this.P.z - b.pos.z);
            b.alt = b.dist - def.radius;
            if (!best || b.alt < best.alt) best = b;
        }
        return best;
    }

    /** Close to a body: the burning air of its fall to the ground, the Sun's heat. */
    _bodiesCheck(dt, t, near) {
        const g = this.game;
        let heat = 0;
        for (const b of this._bodies) {
            const def = b.def;
            if (def.kind === 'star') {
                heat = clamp((SPACE.HEAT_R - b.dist) / (SPACE.HEAT_R - SPACE.DEATH_R), 0, 1);
                if (b.dist < SPACE.DEATH_R) { this._die('☀️ Вы сгорели у Солнца. Так близко к нему не выживает никто — никакая защита не помогает'); return; }
                continue;
            }
            const nx = (this.P.x - b.pos.x) / b.dist, ny = (this.P.y - b.pos.y) / b.dist, nz = (this.P.z - b.pos.z) / b.dist;
            const inward = -(this.vel.x * nx + this.vel.y * ny + this.vel.z * nz);
            // into its air and down to its ground (straight down without air; the giants too — the author:
            // they have a ground of hard cloud, one stands on it)
            const entryAlt = 40 + def.radius * 0.04;
            if (b.alt < entryAlt && (inward > 0 || b.alt < 8)) { this._startEntry(def, b); return; }
        }
        this.heat = heat;
    }

    _startEntry(def, b) {
        const g = this.game;
        this.state = 'entry';
        this._entryDef = def;
        this._t = 0;
        const air = def.id === 'earth' || breathable(def);
        this._entryT = air ? FLYMAX.ENTRY_T : 0.8;
        this._entryAir = air;
        // where: the very place flown at (the surface under the hero in the planet's own frame)
        const t = this.now();
        _d.x = this.P.x - b.pos.x; _d.y = this.P.y - b.pos.y; _d.z = this.P.z - b.pos.z;
        if (def.id === 'earth') dirToEarth(_d, _s);
        else { toPlanet(_d, def, t); dirToSurface(def, _d, _s); }
        this.dest = { id: def.id, x: Math.round(_s.x), z: Math.round(_s.z) };
        if (air) g.sound?.playSpace?.('spaceEntry', 1);
        this._say(def.id === 'earth' ? '🔥 Вход в атмосферу Земли!' : air ? `🔥 Вход в атмосферу: ${def.name}` : `🪐 Посадка: ${def.name}`, 'entry', 3000);
    }

    /** The air burning round the hero; the land below is made meanwhile; then he is over it. */
    _entry(dt, t, near) {
        const g = this.game, ch = g.character, p = ch.group.position;
        this._t += dt;
        const k = this._t / this._entryT;
        // still falling in, slower and slower
        const def = this._entryDef, pos = planetPosition(def, t, _p, this.planets);
        const dist = Math.hypot(this.P.x - pos.x, this.P.y - pos.y, this.P.z - pos.z) || 1;
        const v = Math.max(20, 160 * (1 - k));
        this.P.x -= ((this.P.x - pos.x) / dist) * v * dt; this.P.y -= ((this.P.y - pos.y) / dist) * v * dt; this.P.z -= ((this.P.z - pos.z) / dist) * v * dt;
        this.vel.x = this.vel.y = this.vel.z = 0;
        this._place();
        if (this._entryAir) {
            g.fx.shake = Math.max(g.fx.shake || 0, 0.9 * Math.sin(Math.min(1, k) * Math.PI) + 0.2);
            for (let i = 0; i < 6; i++) {
                const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 3;
                g.fx.spark(_v1.set(p.x + Math.cos(a) * r, p.y - 2.5 + Math.random() * 2, p.z + Math.sin(a) * r), i % 2 ? 0xff7a2a : 0xffd27a, 0.35, _v2.set(Math.cos(a) * 3, 18 + Math.random() * 10, Math.sin(a) * 3), 0.5);
            }
            this._overlay('fire', smoothstep(0, 0.5, k) * (1 - smoothstep(0.85, 1, k) * 0.2));
        } else this._overlay('black', smoothstep(0.4, 1, k));
        // the land there is made now, while the air burns (the terrain workers), the castles round it planned
        // (workers too), the sea's shore worked out a little a frame: no long frame on arrival
        if (this.dest) {
            g.world?.update?.({ x: this.dest.x, y: 0, z: this.dest.z }, 1);
            if (this.dest.id === 'earth') {
                // (the nearest castles first: the people wake there at once; then the ones the map shows)
                const r = this._t < this._entryT * 0.5 ? 480 : 900 + 480;
                g.world?.terrain?.warmSites?.(this.dest.x, this.dest.z, r, 480);
                g.seaSurface?.prepareAt?.(this.dest.x, this.dest.z, 2);
            }
        }
        // (the air burns on a little longer while the place is still being made — a few seconds at most)
        if (this._t >= this._entryT && (this._placeReady() || this._t >= this._entryT + 4)) this._arrive();
    }

    /** Is the place to fall to ready: its land made, its castles planned, its sea's shore worked out? */
    _placeReady() {
        const g = this.game, d = this.dest, T = g.world?.terrain;
        if (!d || !T) return true;
        const cx = Math.floor(d.x / CHUNK), cz = Math.floor(d.z / CHUNK);
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!T.meshes?.has(chunkKey(cx + dx, cz + dz))) return false;
        if (d.id !== 'earth') return true;
        if (g.seaSurface?._job) return false;
        const S = T.data.sites;
        if (!S) return true;
        const cell = 480, r = 900 + 480;
        for (let gz = Math.floor((d.z - r) / cell) - 1; gz <= Math.floor((d.z + r) / cell) + 1; gz++) {
            for (let gx = Math.floor((d.x - r) / cell) - 1; gx <= Math.floor((d.x + r) / cell) + 1; gx++) {
                const key = S.castles._key(gx, gz);
                if (!S.castles.cells.has(key) || !S.towers.cells.has(key) || (S.villages && !S.villages.cells.has(key))) return false; // (the wizards' settlements too: WizardVillages.js)
            }
        }
        return true;
    }

    /** Over the place flown at, high up, falling into the usual flight. */
    _arrive() {
        const g = this.game, ch = g.character, p = ch.group.position;
        const d = this.dest;
        const ground = this._ground(d.x, d.z);
        const h = d.id === 'earth' ? FLYMAX.DESC_H : 160;
        p.set(d.x + 0.5, Math.max(ground + h, d.id === 'earth' ? 260 : ground + 120), d.z + 0.5);
        this._last.copy(p);
        this.state = 'descend';
        this._t = 0;
        this._v = 120;
        this._descTop = p.y;
        this.realm = realmAt(p.x, p.y, p.z, this.planets);
        if (d.id !== 'earth') this._found(d.id); // (through its air, over its ground: the planet is found)
        g.character.gravityK = 1;
        this._ovKind = this._entryAir ? 'white' : 'black'; this._ovK = 1; // (out of the burning air: it clears)
        // (the castles and ships left far behind fall asleep at once: nobody of theirs asks for land long gone)
        if (g.castleLife) g.castleLife._scanT = 0;
        if (g.ships) g.ships._scanT = 0;
        const fl = g.flight;
        if (!fl.active) fl.float();
        fl.hovering = false;
        if (d.id === 'earth') this._restoreEarthSky();
    }

    _descend(dt, pose) {
        const g = this.game, ch = g.character, p = ch.group.position, fl = g.flight;
        this._t += dt;
        this._v = Math.max(18, this._v * Math.exp(-0.9 * dt));
        p.y -= this._v * dt;
        const ground = this._ground(p.x, p.z);
        fl.tilt += (0.6 - fl.tilt) * Math.min(1, dt * 2);
        ch.flying = true;
        ch.setFlightTilt(fl.tilt);
        ch.head.rotation.x = g.smoothHead.pitch + fl.tilt - 0.5;
        ch.flightView = -0.5;
        this.climbK = this.realm === 'earth' ? smoothstep(110, this._descTop, p.y) : 0;
        if (p.y - ground < 70 || this._t > 12) {
            // the usual flight from here (diving a little, at the usual speed)
            this.state = 'off';
            fl.state = 'cruise'; fl.t = 2; fl.hovering = false; fl.speed = 22; fl.pitch = -0.25;
            this.climbK = 0;
            this._say(`${this.realm === 'earth' ? '🌍' : '🪐'} Вы в небе над ${this.realm === 'earth' ? 'Землёй' : this.planets.get(this.realm)?.name || 'планетой'}. Летите, куда хотите; «Flying Maxima» — снова в космос`, 'arrived', 5000);
        }
    }

    // ─────────────────────────────────────────────────────────────── after the world moved
    /**
     * The sky, the light, the fog, the weather and the breathing for where the hero is (Game.frame,
     * after the world's own day / night): every frame while off the Earth or climbing.
     */
    afterWorld(dt) {
        const g = this.game;
        if (!this.enabled) return;
        this._groundStep(); // (a terraformed planet's land remade when its time came)
        this._breath(dt);
        this._heatFx(dt);
        this._overlayStep(dt);
        if (this.realm !== 'space') this._labels(0); // (the planets' names: only in space)
        const world = g.world, sky = world.sky;
        if (this.realm === 'earth') {
            const k = this.state === 'ascend' || this.state === 'descend' ? this.climbK || 0 : 0;
            if (k > 0.001) this._darkSky(k);
            else if (this._skyDark) this._restoreEarthSky();
            g.sound?.spaceLoop?.('spaceWind', 0);
            return;
        }
        this._skyDark = true;
        if (this.realm === 'space') {
            if (sky) sky.mesh.visible = false;
            this._fogOff();
            this._sunLight(1, 0xfff6e6, 0.2);
            g.sound?.spaceLoop?.('spaceWind', 0);
            return;
        }
        this._planetSky(dt);
    }

    /** Climbing out of the Earth's air: the sky goes dark, the stars come out, the haze falls away. */
    _darkSky(k) {
        const w = this.game.world, sky = w.sky;
        this._skyDark = true;
        if (sky) {
            const u = sky.uniforms;
            u.uZenith.value.lerp(_c1.setRGB(0.0, 0.0, 0.01), k);
            u.uHorizon.value.lerp(_c1.setRGB(0.02, 0.05, 0.14), Math.pow(k, 0.7));
            u.uGround.value.lerp(_c1.setRGB(0.01, 0.02, 0.05), k);
            u.uNight.value = Math.max(u.uNight.value, k);
            u.uClouds.value = k > 0.55 ? 0 : u.uClouds.value;
            u.uOvercast.value *= 1 - k;
        }
        const f = this.game.scene.fog;
        if (f) {
            f.far = f.far + (6000 - f.far) * k;
            f.near = f.near + (3000 - f.near) * k;
            f.color.lerp(_c1.setRGB(0.02, 0.05, 0.14), k);
            if (this.game.scene.background?.isColor) this.game.scene.background.copy(f.color);
        }
    }

    _fogOff() {
        const f = this.game.scene.fog;
        if (f) { f.near = 1e7; f.far = 2e7; f.color.setRGB(0, 0, 0); }
    }

    /** The world's light from the Sun's real direction (space, a planet without air). */
    _sunLight(k, color, amb) {
        const w = this.game.world, t = this.now();
        const sunDist = Math.hypot(this.P.x, this.P.y, this.P.z) || 1;
        const fall = clamp(Math.pow(SPACE.AU / sunDist, 0.6), 0.35, 1.6); // (dim at Pluto, bright at Mercury)
        const dl = w.dirLight;
        if (!dl) return;
        _v1.set(-this.P.x, -this.P.y, -this.P.z).normalize();
        const p = this.game.character.group.position;
        dl.target.position.copy(p); dl.target.updateMatrixWorld();
        dl.position.copy(p).addScaledVector(_v1, 200);
        dl.color.set(color);
        dl.intensity = 1.05 * fall * k;
        w.ambientLight.intensity = amb;
        w.ambientLight.color.setRGB(0.8, 0.85, 1);
        w.hemiLight.intensity = amb * 0.6;
        void t;
    }

    /** On another planet: its sky, its sun where it really is in its sky, its fog and weather. */
    _planetSky(dt) {
        const g = this.game, w = g.world, sky = w.sky, def = this.planets.get(this.realm);
        if (!def) return;
        const t = this.now(), p = g.character.group.position;
        const local = this.localSun(def, p.x, p.z, t);
        const c = _p, n = _v1, east = _v3, north = _v4;
        this.P.x = c.x + n.x * def.radius; this.P.y = c.y + n.y * def.radius; this.P.z = c.z + n.z * def.radius; // (for the light's strength, the map)
        this._localFrame = { n: n.clone(), east: east.clone(), north: north.clone() };
        const elev = local.y;
        const day = smoothstep(-0.06, 0.12, elev);
        const tk = this._terraFx(dt, def); // («Terraform Planet» going on here: its stages)
        const vac = def.sky === 'vacuum' || (tk >= 0 && tk < TERRA_STAGE.AIR); // (no air yet: the black sky of before)
        const airK = tk < 0 ? 1 : smoothstep(TERRA_STAGE.AIR, TERRA_STAGE.AIR + 0.2, tk); // (the new sky coming)
        if (sky) {
            sky.mesh.visible = !vac;
            sky.setSunDirection(local);
            const u = sky.uniforms;
            if (def.sky === 'mars') {
                u.uZenith.value.setRGB(0.55, 0.38, 0.25).lerp(_c1.setRGB(0.02, 0.02, 0.04), 1 - day);
                u.uHorizon.value.setRGB(0.86, 0.66, 0.46).lerp(_c1.setRGB(0.05, 0.04, 0.06), 1 - day);
                u.uGround.value.setRGB(0.45, 0.28, 0.18).lerp(_c1.setRGB(0.02, 0.02, 0.03), 1 - day);
                u.uNight.value = 1 - day; u.uClouds.value = 0; u.uOvercast.value = 0;
            } else if (def.sky === 'alien') {
                // a terraformed planet (PlanetMagic.js): its own air's colours, its own clouds
                const z = def.skyZ || [0.3, 0.45, 0.8], h = def.skyH || [0.75, 0.8, 0.9];
                u.uZenith.value.setRGB(z[0], z[1], z[2]).lerp(_c1.setRGB(0.01, 0.01, 0.03), 1 - day);
                u.uHorizon.value.setRGB(h[0], h[1], h[2]).lerp(_c1.setRGB(0.03, 0.03, 0.06), 1 - day);
                u.uGround.value.setRGB(h[0] * 0.5, h[1] * 0.5, h[2] * 0.5).lerp(_c1.setRGB(0.02, 0.02, 0.03), 1 - day);
                u.uNight.value = 1 - day; u.uClouds.value = def.climate === 'desert' ? 0 : tk < 0 ? 1 : smoothstep(TERRA_STAGE.AIR + 0.1, TERRA_STAGE.AIR + 0.3, tk); u.uOvercast.value = 0;
                if (airK < 1) { u.uZenith.value.multiplyScalar(airK); u.uHorizon.value.lerp(_c1.set(def.atmosphere ?? 0x9fe0ff), 1 - airK).multiplyScalar(0.3 + 0.7 * airK); u.uGround.value.multiplyScalar(airK); }
            } else if (def.sky === 'gas' && def.skyCol) {
                // a giant: a sky of its own colour (Jupiter's tan, Saturn's pale gold, Uranus' cyan, Neptune's blue)
                const [zc, hc, gc] = def.skyCol, dk = 0.12 + 0.88 * day;
                u.uZenith.value.set(zc).multiplyScalar(dk); u.uHorizon.value.set(hc).multiplyScalar(dk); u.uGround.value.set(gc).multiplyScalar(dk);
                u.uNight.value = (1 - day) * 0.8; u.uClouds.value = 0; u.uOvercast.value = 0;
            } else if (def.sky === 'venus') {
                u.uZenith.value.setRGB(0.66, 0.5, 0.26).multiplyScalar(0.3 + 0.7 * day);
                u.uHorizon.value.setRGB(0.88, 0.7, 0.4).multiplyScalar(0.3 + 0.7 * day);
                u.uGround.value.setRGB(0.5, 0.36, 0.2).multiplyScalar(0.3 + 0.7 * day);
                u.uNight.value = 0; u.uClouds.value = 0; u.uOvercast.value = 0; // (one thick yellow cloud cover: no gaps, no grey Earth clouds)
            }
        }
        const f = g.scene.fog;
        if (f) {
            if (vac) { f.color.setRGB(0, 0, 0); f.near = Math.max(60, f.far * 0.75); }
            else if (def.sky === 'mars') { f.color.setRGB(0.78, 0.57, 0.4).multiplyScalar(0.25 + 0.75 * day); f.near = 30; }
            else if (def.sky === 'gas' && def.skyCol) { f.color.set(def.skyCol[1]).multiplyScalar(0.15 + 0.85 * day); f.near = 25; }
            else if (def.sky === 'alien') { const h = def.skyH || [0.75, 0.8, 0.9]; f.color.setRGB(h[0], h[1], h[2]).multiplyScalar(0.15 + 0.85 * day); f.near = 40; }
            else { f.color.setRGB(0.8, 0.62, 0.34).multiplyScalar(0.3 + 0.7 * day); f.near = 6; f.far = Math.min(f.far, 150); }
            if (g.scene.background?.isColor) g.scene.background.copy(f.color);
        }
        // the light: from this planet's sun (dim through Venus' clouds — mostly the glow of the sky)
        const dl = w.dirLight;
        if (dl) {
            dl.target.position.copy(p); dl.target.updateMatrixWorld();
            dl.position.copy(p).add(_v1.copy(local).multiplyScalar(200));
            const sunDist = Math.hypot(c.x, c.y, c.z) || 1;
            const fall = clamp(Math.pow(SPACE.AU / sunDist, 0.6), 0.4, 1.6);
            const venus = def.sky === 'venus';
            const alien = def.sky === 'alien';
            dl.intensity = (venus ? 0.35 : vac ? 0.85 : 1.0) * fall * day;
            dl.color.set(venus ? 0xffd49a : def.sky === 'mars' ? 0xffe2c4 : alien && def.climate === 'desert' ? 0xffe0b8 : 0xffffff);
            w.ambientLight.intensity = venus ? 0.32 * (0.4 + 0.6 * day) + 0.05 : vac ? 0.07 + 0.05 * day : alien ? 0.2 + 0.25 * day : def.kind === 'gas' ? 0.24 + 0.12 * day : 0.16 + 0.1 * day;
            w.ambientLight.color.set(venus ? 0xffc77a : def.sky === 'mars' ? 0xffc9a4 : alien ? (def.atmosphere ?? 0xc8d4ff) : 0xc8d4ff);
            w.hemiLight.intensity = venus ? 0.25 * (0.3 + 0.7 * day) : vac ? 0.03 : 0.12 * day;
            if (tk >= 0 && tk < TERRA_STAGE.AIR + 0.1) {
                // (the planet's own light from inside, pulsing with the waves — the night side too)
                const pulse = 0.5 + 0.5 * Math.sin(this.now() * 5);
                w.ambientLight.color.set(def.atmosphere ?? 0x9fe0ff);
                w.ambientLight.intensity = Math.max(w.ambientLight.intensity, 0.35 + 0.45 * pulse);
                w.hemiLight.intensity = Math.max(w.hemiLight.intensity, 0.2 + 0.25 * pulse);
            }
        }
        this._weather(dt, def);
    }

    /**
     * Where the Sun is in a planet's sky over a place of its surface (a unit vector in the world's axes:
     * x east, y up, z south). Also leaves the planet's centre in _p and the local frame in _v1 (up),
     * _v3 (east), _v4 (north).
     */
    localSun(def, x, z, t = this.now()) {
        const c = planetPosition(def, t, _p, this.planets);
        surfaceToDir(def, x, z, _d);
        toSpace(_d, def, t);
        const n = _v1.set(_d.x, _d.y, _d.z).normalize();
        const s = _v2.set(-c.x - n.x * def.radius, -c.y - n.y * def.radius, -c.z - n.z * def.radius).normalize();
        // the local frame: up = n, east = axis × n, north = n × east (the world's x east, −z north)
        _d.x = 0; _d.y = 1; _d.z = 0; tiltZ(_d, def);
        const east = _v3.set(_d.x, _d.y, _d.z).cross(n);
        if (east.lengthSq() < 1e-6) east.set(1, 0, 0); else east.normalize();
        const north = _v4.copy(n).cross(east).normalize();
        return _v5.set(s.dot(east), s.dot(n), -s.dot(north)).normalize();
    }

    /** Venus' storms: the wind pushes, dust flies, lightning far off. Mars: a little dust. */
    _weather(dt, def) {
        const g = this.game, p = g.character.group.position;
        if (!def.storms) { g.sound?.spaceLoop?.('spaceWind', def.sky === 'mars' ? 0.15 : 0); return; }
        const t = this.now();
        const dir = t * 0.03, gust = 0.6 + 0.4 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
        const wx = Math.cos(dir) * 11 * gust, wz = Math.sin(dir) * 11 * gust;
        this.wind = { x: wx, z: wz };
        if (g.flight?.active) { p.x += wx * 0.35 * dt; p.z += wz * 0.35 * dt; }
        else if (g.knockback) { g.knockback.x += wx * 0.55 * dt; g.knockback.z += wz * 0.55 * dt; }
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 14;
            g.fx.spark(_v1.set(p.x + Math.cos(a) * r - wx, p.y - 1 + Math.random() * 4, p.z + Math.sin(a) * r - wz), i % 2 ? 0xc89a5a : 0xa8783e, 0.12 + Math.random() * 0.15, _v2.set(wx * 1.6, (Math.random() - 0.5), wz * 1.6), 1.2);
        }
        g.sound?.spaceLoop?.('spaceWind', 0.45 + 0.4 * gust);
        // lightning in the clouds far off: a flash, then the thunder (no harm: only the wind pushes)
        this._boltT -= dt;
        if (this._boltT <= 0) {
            this._boltT = 3 + Math.random() * 8;
            const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 120;
            g.fx.lightFlash?.(_v1.set(p.x + Math.cos(a) * r, p.y + 40 + Math.random() * 40, p.z + Math.sin(a) * r), 0xfff0c8, 3, 0.25, 260);
            const f = g.scene.fog;
            if (f) f.color.multiplyScalar(1.6);
            setTimeout(() => g.sound?.playThunder?.(), 600 + r * 6);
        }
    }

    /** Without air, the hero breathes by magic: −0.5 mana a second; no mana — he suffocates. */
    _breath(dt) {
        const g = this.game, c = g.combat;
        const def = this.planets.get(this.realm);
        const airless = this.realm === 'space' || (def && this.realm !== 'earth' && !breathable(def));
        this.breathing = airless;
        // «Flying Maxima» itself: −1.5 mana a second while it carries the hero (the author) — the climb, space, the burning air —
        // and the plain «Флайн» under it on top, its own price (2.5, hovering 1.8: Flight.FLIGHT; the author: both are paid in space)
        this.maxFlying = this.state === 'ascend' || this.state === 'entry' || this.realm === 'space';
        this.flyCost = this.maxFlying ? FLYMAX.FLY + (g.flight?.hovering ? FLIGHT.HOVER_COST : FLIGHT.COST) : 0;
        if (this.maxFlying && c?.enabled && !g.isDeadLocal && !c.dead) c.fatigue = Math.max(0, c.fatigue - this.flyCost * dt);
        if (!airless || g.isDeadLocal || c?.dead) { this.suffocate = 0; this._panel(); return; }
        if (c?.enabled) {
            // (the mana comes back as always, 1 a second × the bonuses; breathing takes 0.5 and «Flying Maxima» 1.5 —
            //  in space it runs down slowly; spent to nothing — nothing to breathe with)
            c.fatigue = Math.max(0, c.fatigue - FLYMAX.BREATH * dt);
            if (c.fatigue < 0.05) {
                this.suffocate += dt;
                this._overlay('suffocate', clamp(this.suffocate / FLYMAX.SUFFOCATE, 0.15, 0.9));
                this._say(`🫁 Мана кончилась — нечем дышать! Скорее туда, где есть воздух (Земля, Венера, Марс, планеты-гиганты): ${Math.max(0, Math.ceil(FLYMAX.SUFFOCATE - this.suffocate))} с`, 'suff' + Math.ceil(FLYMAX.SUFFOCATE - this.suffocate), 900);
                if (this.suffocate >= FLYMAX.SUFFOCATE) this._die(this.realm === 'space' ? '🫁 Вы задохнулись в космосе: кончилась мана, а без неё там не дышат' : `🫁 Вы задохнулись: на планете «${def?.name}» нет воздуха, а мана кончилась`);
            } else this.suffocate = Math.max(0, this.suffocate - dt * 2);
        }
        this._panel();
    }

    /** Near the Sun: the heat (a warning, a glow, its sound). */
    _heatFx(dt) {
        const g = this.game;
        const k = this.realm === 'space' ? this.heat : 0;
        g.sound?.spaceLoop?.('spaceHeat', k * 1.2);
        if (k > 0.02) {
            this._overlay('heat', k * 0.85);
            g.fx.shake = Math.max(g.fx.shake || 0, k * 0.6);
            this._say(k > 0.6 ? '🔥 ЖАР! Вы сгораете — немедленно прочь от Солнца!' : '☀️ Солнце совсем близко — становится нестерпимо жарко. Дальше — верная смерть!', k > 0.6 ? 'heat2' : 'heat1', 4000);
        }
    }

    _die(text) {
        const g = this.game;
        if (g.isDeadLocal || g.combat?.dead) return;
        this._overlay('heat', 0);
        if (g.combat?.enabled) { g.combat.dead = true; g.combat.hp = 0; } else g.isDeadLocal = true;
        g.onLocalDeath(text, null);
    }

    /** Back to life on the Earth (Game.respawn): nothing of space left on. */
    onRespawn() {
        this.state = 'off';
        this.suffocate = 0; this.heat = 0;
        this._overlay('none', 0);
        this.game.character.gravityK = 1;
        this._restoreEarthSky();
    }

    _restoreEarthSky() {
        const g = this.game, w = g.world;
        if (!w) return;
        if (w.sky) w.sky.mesh.visible = true;
        this._skyDark = false;
        g.sound?.spaceLoop?.('spaceWind', 0);
        g.sound?.spaceLoop?.('spaceHeat', 0);
        // (the world's own day and light, worked out afresh)
        w._night = -1; w._phase = -1; w._shadowX = null;
        if (g.dayCycle) w.setDayPhase(g.dayPhase());
        else w.setNightMode?.(g.isNight);
        if (w.sky && !g.dayCycle) w.sky.setClouds(true);
    }

    // ─────────────────────────────────────────────────────────────── drawing
    /**
     * Draw the frame: space first (when it shows: in space, climbing high, on a planet without air),
     * the game's own scene over it. @returns true when drawn here.
     */
    render() {
        const g = this.game, view = this.view;
        if (!view || !this.enabled) return false;
        const def = this.planets.get(this.realm);
        // (climbing out of the Earth's air its own sky darkens and shows its stars: _darkSky — space itself
        //  is drawn from the white-out on)
        const vac = this.realm === 'space' || (def && this.realm !== 'earth' && (def.sky === 'vacuum' || (this.terraP(def) >= 0 && this.terraP(def) < TERRA_STAGE.AIR)));
        const high = false;
        if (!vac) return false;
        const R = g.renderer, cam = g.camera, t = this.now();
        // the camera in space: in space — the hero's place; on a planet — its ground, in its turning frame
        let hide = null;
        _q.copy(cam.quaternion);
        if (this.realm === 'space') {
            _p2.x = this.O.x + (cam.position.x - A.x); _p2.y = this.O.y + (cam.position.y - A.y); _p2.z = this.O.z + (cam.position.z - A.z);
        } else if (def && this.realm !== 'earth' && this._localFrame) {
            const F = this._localFrame;
            const c = planetPosition(def, t, _p, this.planets);
            const up = def.radius + 4 + Math.max(0, cam.position.y) * 0.05;
            _p2.x = c.x + F.n.x * up; _p2.y = c.y + F.n.y * up; _p2.z = c.z + F.n.z * up;
            // the world's axes in space: x = east, y = up, z = south
            _m.makeBasis(F.east, F.n, _v6.copy(F.north).negate());
            _q.setFromRotationMatrix(_m).multiply(cam.quaternion);
            hide = def.id;
        } else {
            // climbing out of the Earth's air: the planets and stars appear over the darkening sky
            const e = planetPosition(this.planets.get('earth'), t, _p, this.planets);
            earthToDir(cam.position.x, cam.position.z, _d);
            const up = this.planets.get('earth').radius + 30 + cam.position.y * 0.05;
            _p2.x = e.x + _d.x * up; _p2.y = e.y + _d.y * up; _p2.z = e.z + _d.z * up;
            hide = 'earth';
        }
        const near = this._nearest(t);
        const nearAlt = near ? Math.hypot(_p2.x - near.pos.x, _p2.y - near.pos.y, _p2.z - near.pos.z) - near.def.radius : 1000;
        view.update(t, _p2, _q, { fov: cam.fov, aspect: cam.aspect, height: R.domElement?.height || 720, near: clamp(nearAlt * 0.3, 1, 60), hide, k: high ? smoothstep(0.3, 1, this.climbK) : 1, orbits: this.realm === 'space', orbitK: smoothstep(6000, 40000, nearAlt) });
        const bg = g.scene.background, skyVis = g.world.sky?.mesh.visible;
        const auto = R.autoClear;
        R.autoClear = true;
        view.render(R);
        R.autoClear = false;
        R.clearDepth();
        g.scene.background = null;
        if (high && g.world.sky) g.world.sky.mesh.visible = false;
        R.render(g.scene, cam);
        g.scene.background = bg;
        if (g.world.sky) g.world.sky.mesh.visible = skyVis;
        R.autoClear = auto;
        this._labels(t);
        return true;
    }

    /**
     * How high the ground is somewhere (roughly: without the castles' levelled land — asking for that
     * would plan the castles there at once, a long job; the workers plan them meanwhile).
     */
    _ground(x, z) {
        const d = this.game.world?.terrain?.data;
        if (!d) return 0;
        const ix = Math.round(x), iz = Math.round(z);
        return ix >= SPACE.ZONE_X ? d.heightAt(ix, iz) : (d.rawHeight || d.heightAt)(ix, iz);
    }

    /** Every shader of space made now (Game.prewarm, the loading screen). */
    prewarm(renderer) {
        this.view?.compile(renderer);
    }

    // ─────────────────────────────────────────────────────────────── the planets' maps
    _askTextures() {
        if (!this.view || this._worker === false) return;
        if (!this._worker) {
            try {
                this._worker = new Worker(new URL('../world/space.worker.js', import.meta.url), { type: 'module' });
                this._worker.onmessage = (e) => this._gotTexture(e.data);
                this._worker.onerror = (e) => { e.preventDefault?.(); this._worker = false; };
                const T = this.game.world.terrain;
                this._worker.postMessage({ type: 'init', opts: T.opts, planets: this.planets.toJSON() });
            } catch (e) { this._worker = false; return; }
        }
        this._texQueue = this.planets.list.filter((d) => !this._tex.has(d.id) && d.kind !== 'star').map((d) => d.id);
        // the Earth first (seen at once), the rest by distance from it
        this._texQueue.sort((a, b) => (a === 'earth' ? -1 : b === 'earth' ? 1 : (this.planets.get(a).a || 0) - (this.planets.get(b).a || 0)));
        this._nextTexture();
    }

    _nextTexture() {
        if (!this._worker || this._texBusy) return;
        const id = this._texQueue?.shift();
        if (!id) return;
        const def = this.planets.get(id);
        if (!def) return this._nextTexture();
        const big = id === 'earth' || id === 'jupiter' || id === 'saturn';
        this._tex.set(id, 'asked');
        this._texBusy = true;
        this._worker.postMessage({ type: 'tex', id, w: big ? 1024 : 512, h: big ? 512 : 256 });
    }

    _gotTexture(m) {
        this._texBusy = false;
        if (m.type === 'tex' && !m.none && m.data) {
            // (put in a frame of its own: one upload, then the next map is asked for)
            this._pendingTex = this._pendingTex || [];
            this._pendingTex.push(m);
        }
        this._nextTexture();
    }

    /** One finished map a frame goes to the video card (Game.frame). */
    uploadStep() {
        const m = this._pendingTex?.shift();
        if (m) { this.view?.setTexture(m.id, m.w, m.h, m.data); this._tex.set(m.id, 'done'); }
    }

    _planetsChanged() {
        const json = this.planets.toJSON();
        // (only the planets whose ground changed — made, terraformed — have their land and map made again;
        //  a bigger planet or a new orbit changes neither: nothing is remade for it)
        const sig = this._groundSig || (this._groundSig = new Map()), changed = [];
        // (a planet blown up — «Planet Liquidation», PlanetDestroy.js: its ground goes with it)
        const gone = [];
        for (const id of sig.keys()) if (!this.planets.get(id)) { gone.push(id); sig.delete(id); this._tex.delete(id); this._prev.delete(id); }
        if (gone.length) this.game.world?.terrain?.planetGone?.(json, gone, this.planets.gone.filter((g) => gone.includes(g.id)).map((g) => g.slot));
        for (const p of this.planets.list) {
            if (p.kind === 'star') continue;
            const k = `${p.seed}|${p.look}|${p.terraformed ? p.climate || 1 : 0}|${p.slot}`;
            if (sig.has(p.id) && sig.get(p.id) !== k) changed.push(p.id);
            else if (!sig.has(p.id) && sig.size && !p.base) changed.push(p.id);
            sig.set(p.id, k);
        }
        // (a planet being terraformed: its land is remade only when its air has come — half way through the 20 s,
        //  then chunk by chunk round the hero, the nearest first: the land changes before one's eyes)
        const later = this._sentGround ? changed.filter((id) => { const k = this.terraP(this.planets.get(id)); return k >= 0 && k < TERRA_STAGE.LAND; }) : [];
        const now = changed.filter((id) => !later.includes(id));
        if (now.length || !this._sentGround) { this.game.world?.terrain?.planetsChanged?.(json, this._sentGround ? now : null); this._sentGround = true; }
        for (const id of later) (this._groundLater || (this._groundLater = new Map())).set(id, this.planets.get(id).terraAt + TERRA_STAGE.LAND * VIEW_FX.TERRA);
        if (this._worker) {
            this._worker.postMessage({ type: 'planets', s: json });
            for (const id of changed) this._tex.delete(id); // (a changed planet's map made again)
            if (this._prepared && changed.length) this._askTextures();
        }
        if (this.game.authority && this.game.sync?.net?.active) this.game.sync.net.send({ t: 'planets', s: json });
    }

    /** How far a planet's terraforming is (0..1 over its VIEW_FX.TERRA s), or -1 when it is not going on. */
    terraP(def) {
        if (!def?.terraAt) return -1;
        const k = (this.now() - def.terraAt) / VIEW_FX.TERRA;
        return k >= 0 && k < 1 ? k : -1;
    }

    /** The land of a terraformed planet, remade when its time came (_planetsChanged). Every frame (afterWorld). */
    _groundStep() {
        const L = this._groundLater;
        if (!L?.size) return;
        const t = this.now();
        for (const [id, at] of L) if (t >= at) { L.delete(id); this.game.world?.terrain?.planetsChanged?.(this.planets.toJSON(), [id]); }
    }

    /**
     * Standing on a planet while it is terraformed (PlanetMagic.js; the same on every computer — its terraAt):
     * first the ground lights up and waves of light run over it (the black sky of before), then the air flares
     * up — a white flash, the sky and its clouds come — then water and its own green: the land is remade round
     * the hero, the nearest first (_groundStep). Returns how far it is (or -1).
     */
    _terraFx(dt, def) {
        const k = this.terraP(def);
        if (k < 0) { this._terraSeen = null; return -1; }
        const g = this.game, p = g.character.group.position, col = def.atmosphere ?? 0x9fe0ff, leaf = def.ground?.leaf ?? 0x9a5ad0, sea = def.ground?.sea ?? 0x4aa0e0;
        const seen = this._terraSeen?.at === def.terraAt ? this._terraSeen : (this._terraSeen = { at: def.terraAt, st: -1 });
        const stage = k < TERRA_STAGE.WAVES ? 0 : k < TERRA_STAGE.AIR ? 1 : k < TERRA_STAGE.LAND + 0.08 ? 2 : k < 0.96 ? 3 : 4;
        if (stage !== seen.st) {
            seen.st = stage;
            const say = ['✨ Планета светится изнутри…', '🌊 По земле бегут волны света', '🌬️ Вспыхнула атмосфера — над вами её небо и облака', '💧 Растекается вода, прорастает своя зелень — земля меняется на глазах', `🌍 «${def.name}» ожила`][stage];
            this._say(say, 'terra' + stage, 1000);
            if (stage === 2) { this._overlay('white', 0.95); g.sound?.playSpace?.('spaceGift', 1); g.fx.shake = Math.max(g.fx.shake || 0, 0.5); }
        }
        // the ground's own light, the waves of light round the hero (expanding rings), then the sprouting
        if (k < TERRA_STAGE.AIR) {
            const ring = ((k * 4) % 1) * 70 + 3, n = k < TERRA_STAGE.WAVES ? 12 : 22;
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, r = k < TERRA_STAGE.WAVES ? 2 + Math.random() * 30 : ring + Math.random() * 2;
                const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = this._ground(x, z) + 1.2;
                g.fx.spark(_v1.set(x, y, z), col, 0.18, _v2.set(0, 2 + Math.random() * 3, 0), 1.1);
            }
            if (this._waveK !== Math.floor(k * 4)) { this._waveK = Math.floor(k * 4); g.fx.lightFlash?.(p, col, 2, 0.6, 60); }
        } else if (k < 0.95) {
            for (let i = 0; i < 6; i++) {
                const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 40, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
                g.fx.spark(_v1.set(x, this._ground(x, z) + 1.1, z), i % 3 ? leaf : sea, 0.14, _v2.set(0, 1 + Math.random() * 2, 0), 1.4);
            }
        }
        return k;
    }

    // ─────────────────────────────────────────────────────────────── the planet spells' hooks
    /** A spell creates a planet (the host applies it; a guest asks the host). Returns its id (host) or null. */
    create(def) {
        const g = this.game;
        if (!g.authority) { g.sync?.net?.send({ t: 'planets', op: 'create', def }); return null; }
        return this.planets.add(def);
    }

    /** A spell changes a planet (bigger, terraformed, its orbit…). */
    change(id, patch) {
        const g = this.game;
        if (!g.authority) { g.sync?.net?.send({ t: 'planets', op: 'update', id, patch }); return false; }
        return this.planets.update(id, patch);
    }

    /**
     * The Gods' temple on Venus (the other session's src/world/GodsTemple.js): its place — always the same
     * in a world — and its mark on Venus' map once it stands (`registerTemple`).
     */
    templeSpot() {
        const site = FLYMAX.TEMPLE_HOOK?.(this.planets.get('venus')); // (Temple.js: the place its ground is levelled for)
        return site ? { x: site.x, z: site.z, y: site.y ?? site.F ?? this._ground(site.x, site.z), rot: site.rot | 0 } : this.surfaceSpot('venus', 'temple');
    }

    /** The temple stands (GodsTemple.js calls this): {x, z, name} — shown on Venus' map. */
    registerTemple(t) {
        this.temple = t ? { x: t.x, z: t.z, name: t.name || 'Храм богов', icon: t.icon || '🏛️', def: t.def || null } : null;
    }

    /** The marks for the minimap on a planet (the temple on Venus). */
    mapMarks() {
        if (this.realm !== 'venus') return [];
        if (!this.temple && FLYMAX.TEMPLE_HOOK) { const s = this.templeSpot(); if (s) this.temple = { x: s.x, z: s.z, name: 'Храм богов', icon: '🏛️', def: null }; }
        return this.temple ? [this.temple] : [];
    }

    /** A deterministic spot on a planet's surface (e.g. kind 'temple' on Venus): {x, z, y} in the world. */
    surfaceSpot(id, kind = 'temple') {
        const def = this.planets.get(id);
        const r = def && slotRect(def);
        if (!r) return null;
        let h = 2166136261;
        for (const ch of `${kind}:${def.seed}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
        const u = ((h >>> 0) % 10000) / 10000, v = ((Math.imul(h, 2654435761) >>> 0) % 10000) / 10000;
        const x = Math.round(r.cx + (u - 0.5) * r.w * 0.3), z = Math.round(r.cz + (v - 0.5) * r.h * 0.3);
        const data = this.game.world?.terrain?.data;
        return { x, z, y: data ? data.heightAt(x, z) + 1 : 1 };
    }

    // ─────────────────────────────────────────────────────────────── network, saving
    /** In my 'p' message: my place in space (the others draw me there). */
    netPos() {
        if (this.realm !== 'space') return undefined;
        return [Math.round(this.P.x * 10) / 10, Math.round(this.P.y * 10) / 10, Math.round(this.P.z * 10) / 10];
    }

    /** Another player in space: where to draw them in my world (or null: not while I am elsewhere). */
    remoteWorld(sp, out = []) {
        if (this.realm !== 'space' || !Array.isArray(sp)) return null;
        out[0] = A.x + (sp[0] - this.O.x); out[1] = A.y + (sp[1] - this.O.y); out[2] = A.z + (sp[2] - this.O.z);
        return out;
    }

    /** The planets from the host / a guest's ask (NetSync 't: planets'). */
    onNet(m, isHost) {
        if (m.op === 'move') { if (typeof m.id === 'string' && m.o) { this.planets.live(m.id, m.o); this.game.planetMagic?.netHold(m); } return; } // (a planet dragged: PlanetMagic)
        if (m.s && !isHost) { this.planets.applyJSON(m.s); return; }
        if (!isHost) return;
        if (m.op === 'create' && m.def && typeof m.def === 'object') this.planets.add({ ...m.def, created: m.def.created || true });
        else if (m.op === 'update' && typeof m.id === 'string' && m.patch && typeof m.patch === 'object') this.planets.update(m.id, m.patch);
    }

    /** The hero's own (in the player's save): where in space. */
    snapshot() {
        if (this.realm !== 'space') return null;
        return { P: [this.P.x, this.P.y, this.P.z], O: [this.O.x, this.O.y, this.O.z] };
    }

    restore(s) {
        if (!s || !Array.isArray(s.P) || !s.P.every(Number.isFinite)) return;
        this.P.x = s.P[0]; this.P.y = s.P[1]; this.P.z = s.P[2];
        const O = Array.isArray(s.O) && s.O.every(Number.isFinite) ? s.O : s.P;
        this.O.x = O[0]; this.O.y = O[1]; this.O.z = O[2];
        this.state = 'space';
        this.speed = 0;
        this.prepare();
        this._place();
        this.game.flight?.float?.();
    }

    // ─────────────────────────────────────────────────────────────── the map
    /**
     * The space map in the minimap's place (Game.frame, every few frames while in space): the Sun, the
     * orbits, the planets (the Earth lit up), the hero, the line to the Earth with the distance.
     */
    drawMap(hud) {
        const ctx = hud?.mmCtx, cvs = hud?.el?.minimap;
        if (!ctx || !cvs) return false;
        const t = this.now();
        const W = cvs.width, H = cvs.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#04060f';
        ctx.fillRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2, Rm = Math.min(W, H) * 0.47;
        const scale = (a) => (Math.log(1 + a / 4000) / Math.log(1 + 500000 / 4000)) * Rm;
        const toMap = (x, z) => { const r = Math.hypot(x, z); const k = r > 0 ? scale(r) / r : 0; return [cx + x * k, cy + z * k]; };
        // orbits
        ctx.lineWidth = 1;
        for (const def of this.planets.list) {
            if (!def.a || def.parent) continue;
            ctx.strokeStyle = def.id === 'earth' ? 'rgba(127,208,255,0.75)' : 'rgba(111,143,200,0.35)';
            ctx.beginPath(); ctx.arc(cx, cy, scale(def.a), 0, Math.PI * 2); ctx.stroke();
        }
        // the belts
        ctx.strokeStyle = 'rgba(160,140,120,0.25)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, scale(62000), 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, scale(420000), 0, Math.PI * 2); ctx.stroke();
        // the Sun
        ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        const label = (txt, x, y, col = '#fff') => { ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y); };
        // the meteor clusters still free («Create a Planet»: the author couldn't find them) — a little heap of
        // rocks each; the nearest one ringed, with its distance
        let nearC = null;
        for (const c of this.planets.clusters) {
            if (c.used) continue;
            planetPosition(c, t, _p);
            const d = Math.hypot(_p.x - this.P.x, _p.y - this.P.y, _p.z - this.P.z);
            const [x, y] = toMap(_p.x, _p.z);
            ctx.fillStyle = c.belt === 'debris' ? '#ff8f6a' : '#d9a066'; // (the rocks of a blown-up planet: redder)
            for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + (k % 2 ? 2.2 : -2), y + (k < 2 ? -1.6 : 1.8), k ? 1.4 : 1.8, 0, Math.PI * 2); ctx.fill(); }
            if (!nearC || d < nearC.d) nearC = { d, x, y };
        }
        if (nearC) {
            ctx.strokeStyle = 'rgba(255,190,120,0.95)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(nearC.x, nearC.y, 7, 0, Math.PI * 2); ctx.stroke();
            label(`☄️ ${dist(nearC.d)}`, nearC.x, nearC.y + 17, '#ffc98a');
        }
        let earthAt = null;
        for (const def of this.planets.list) {
            if (def.kind === 'star' || def.parent) continue;
            planetPosition(def, t, _p, this.planets);
            const [x, y] = toMap(_p.x, _p.z);
            const r = def.kind === 'gas' ? 3.5 : def.id === 'earth' ? 3.5 : 2.5;
            ctx.fillStyle = '#' + def.color.toString(16).padStart(6, '0');
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            if (def.id === 'earth') { earthAt = [x, y, { ..._p }]; ctx.strokeStyle = '#7fd0ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke(); }
            label(def.name, x, y - 6, def.id === 'earth' ? '#9fe0ff' : '#dfe6ff');
        }
        // me, and the way to the Earth
        const [hx, hy] = toMap(this.P.x, this.P.z);
        if (earthAt) {
            ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(127,208,255,0.9)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(earthAt[0], earthAt[1]); ctx.stroke(); ctx.setLineDash([]);
            const e = earthAt[2], d = Math.hypot(this.P.x - e.x, this.P.y - e.y, this.P.z - e.z) - SPACE.EARTH_R;
            ctx.textAlign = 'left';
            label(`🌍 До Земли: ${dist(d)}`, 6, H - 8, '#9fe0ff');
            ctx.textAlign = 'center';
        }
        // the others in space (their place) and on the planets
        for (const r of this.game.remotes?.values?.() || []) {
            const sp = r.target?.sp;
            if (!Array.isArray(sp)) continue;
            const [x, y] = toMap(sp[0], sp[2]);
            ctx.fillStyle = '#' + (r.color || 0xffffff).toString(16).padStart(6, '0');
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
            label(r.name || 'Игрок', x, y - 5);
        }
        // me: big and bright, a pulsing halo round it (the author couldn't find himself on the map)
        const yaw = this.yaw;
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
        ctx.fillStyle = `rgba(255,225,77,${0.18 + 0.17 * pulse})`;
        ctx.beginPath(); ctx.arc(hx, hy, 15 + 4 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,225,77,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hx, hy, 15 + 4 * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) + Math.PI / 2);
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(11, 11); ctx.lineTo(0, 5); ctx.lineTo(-11, 11); ctx.closePath(); ctx.stroke(); ctx.fill();
        ctx.restore();
        ctx.font = 'bold 13px sans-serif';
        label('Вы', hx, hy + 30, '#ffe14d');
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'right';
        label(`${dist(this.speed)}/с`, W - 6, 13, '#ffe9a8');
        return true;
    }

    // ─────────────────────────────────────────────────────────────── the HUD of space
    _el() {
        if (this._dom || typeof document === 'undefined') return this._dom;
        const root = document.createElement('div');
        root.id = 'space-hud';
        root.innerHTML = '<div class="space-overlay"></div><div class="space-panel"></div><div class="space-labels"></div>';
        const st = document.createElement('style');
        st.textContent = `#space-hud{position:fixed;inset:0;pointer-events:none;z-index:30}
#space-hud .space-overlay{position:absolute;inset:0;opacity:0;transition:none}
#space-hud .space-panel{position:absolute;left:50%;top:12px;transform:translateX(-50%);padding:6px 14px;border-radius:12px;background:rgba(6,10,24,.55);color:#dfeaff;font:600 14px/1.35 system-ui,sans-serif;text-align:center;display:none;white-space:nowrap}
#space-hud .space-label{position:absolute;transform:translate(-50%,-140%);color:#e9f0ff;font:600 12px system-ui,sans-serif;text-shadow:0 0 3px #000,0 0 6px #000;white-space:nowrap}
#space-hud .space-label b{color:#9fe0ff}`;
        root.appendChild(st);
        document.body.appendChild(root);
        this._dom = { root, overlay: root.children[0], panel: root.children[1], labels: root.children[2], pool: [] };
        return this._dom;
    }

    /** The full-screen tint: 'white' (clouds), 'black', 'fire' (burning air), 'heat', 'amber', 'suffocate'. */
    _overlay(kind, k) {
        if (k > (this._ovK || 0) || kind !== this._ovKind || kind === 'none') { this._ovKind = kind; this._ovK = k; this._ovSet = true; }
    }

    _overlayStep(dt) {
        const d = this._el();
        if (!d) return;
        if (!this._ovSet) this._ovK = Math.max(0, (this._ovK || 0) - dt * 1.2); // (fades by itself)
        this._ovSet = false;
        const k = this._ovK || 0;
        const css = { white: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(235,244,255,1) 100%)', black: '#000', fire: 'radial-gradient(circle, rgba(255,140,40,0) 25%, rgba(255,90,20,.85) 75%, rgba(255,210,120,1) 100%)',
            heat: 'radial-gradient(circle, rgba(255,240,200,.6) 0%, rgba(255,120,30,1) 100%)', amber: 'radial-gradient(circle, rgba(230,190,120,.2) 30%, rgba(200,150,80,.9) 100%)',
            suffocate: 'radial-gradient(circle, rgba(0,0,30,0) 35%, rgba(0,0,40,.95) 100%)', none: 'none' }[this._ovKind || 'none'];
        if (d._css !== css) { d.overlay.style.background = css; d._css = css; }
        const o = k < 0.003 ? '0' : k.toFixed(3);
        if (d._o !== o) { d.overlay.style.opacity = o; d._o = o; }
    }

    /** The line at the top: breathing by magic, the nearest planet. */
    _panel() {
        const d = this._el();
        if (!d) return;
        let html = '';
        if (this.offEarth && !this.game.isDeadLocal) {
            const parts = [];
            if (this.maxFlying && this.game.combat?.enabled) parts.push(`🚀 Полёт: <b>−${String(this.flyCost).replace('.', ',')} маны/с</b> (Flying Maxima 1,5 + «Флайн» ${this.game.flight?.hovering ? '1,8' : '2,5'})`);
            if (this.breathing && this.game.combat?.enabled) parts.push('🫧 Дыхание магией: <b>−0,5 маны/с</b>');
            if (this.realm === 'space' && this._bodies?.length) {
                let best = null;
                for (const b of this._bodies) if (b.def.kind !== 'star' && (!best || b.alt < best.alt)) best = b;
                if (best) parts.push(`🪐 ${best.def.name}: ${dist(best.alt)}`);
                parts.push(`🚀 ${dist(this.speed)}/с`);
            } else if (this.realm !== 'space') {
                const def = this.planets.get(this.realm);
                if (def) parts.push(`🪐 ${def.name} · тяжесть ×${def.gravity}`);
                if (def?.storms) parts.push('🌪️ Буря');
            }
            html = parts.join(' · ');
            const doom = this.realm === 'space' ? this.game.planetDestroy?.panelLine?.() : ''; // («Planet Liquidation»: its price on the planet aimed at)
            if (doom) html += `<br>${doom}`;
        }
        if (d._html !== html) { d.panel.innerHTML = html; d.panel.style.display = html ? 'block' : 'none'; d._html = html; }
    }

    /** Names over the planets in space (the nearest few). */
    _labels(t) {
        const d = this._el();
        if (!d) return;
        const show = this.realm === 'space' && this.view;
        let i = 0;
        if (show) {
            const cam = this.view.camera, w = innerWidth, h = innerHeight;
            const list = (this._bodies || []).filter((b) => b.def.kind !== 'star' || true).slice().sort((a, b) => a.alt - b.alt).slice(0, 9);
            for (const b of list) {
                _v1.set(b.pos.x - _p2.x, b.pos.y - _p2.y, b.pos.z - _p2.z);
                const far = _v1.length();
                _v1.project(cam);
                if (_v1.z > 1 || Math.abs(_v1.x) > 1.1 || Math.abs(_v1.y) > 1.1) continue;
                let el = d.pool[i];
                if (!el) { el = d.pool[i] = document.createElement('div'); el.className = 'space-label'; d.labels.appendChild(el); }
                const txt = `${b.def.id === 'earth' ? '<b>' : ''}${b.def.name}${b.def.id === 'earth' ? '</b>' : ''} · ${dist(Math.max(0, b.alt))}`;
                if (el._t !== txt) { el.innerHTML = txt; el._t = txt; }
                el.style.left = `${((_v1.x + 1) / 2) * w}px`;
                el.style.top = `${((1 - _v1.y) / 2) * h}px`;
                el.style.display = 'block';
                void far;
                i++;
            }
        }
        // the meteor clusters: their names and distances over them, and — when the nearest is off the screen
        // (behind, above, below) — an arrow at the edge pointing the way (the map is flat: this shows up / down)
        let arrow = null;
        if (show) {
            const cam = this.view.camera, w = innerWidth, h = innerHeight;
            const list = this._clusterList || (this._clusterList = []);
            list.length = 0;
            for (const c of this.planets.clusters) {
                if (c.used) continue;
                const q = planetPosition(c, t, c._pos || (c._pos = { x: 0, y: 0, z: 0 }));
                c._dist = Math.hypot(q.x - _p2.x, q.y - _p2.y, q.z - _p2.z) - c.r;
                list.push(c);
            }
            list.sort((a, b) => a._dist - b._dist);
            for (let n = 0; n < list.length && n < 3; n++) {
                const c = list[n];
                _v1.set(c._pos.x - _p2.x, c._pos.y - _p2.y, c._pos.z - _p2.z);
                _v6.copy(_v1);
                _v1.project(cam);
                const on = _v1.z < 1 && Math.abs(_v1.x) < 1 && Math.abs(_v1.y) < 1;
                if (!on) { if (n === 0) arrow = { c, dir: _v6.clone() }; continue; }
                let el = d.pool[i];
                if (!el) { el = d.pool[i] = document.createElement('div'); el.className = 'space-label'; d.labels.appendChild(el); }
                const txt = `☄️ ${c.from ? `Обломки «${c.from}»` : 'Скопление метеоритов'} · ${dist(Math.max(0, c._dist))}`; // (from: a blown-up planet's rocks)
                if (el._t !== txt) { el.innerHTML = txt; el._t = txt; }
                el.style.left = `${((_v1.x + 1) / 2) * w}px`;
                el.style.top = `${((1 - _v1.y) / 2) * h}px`;
                el.style.display = 'block';
                i++;
            }
        }
        for (; i < d.pool.length; i++) if (d.pool[i].style.display !== 'none') d.pool[i].style.display = 'none';
        this._arrow(d, arrow);
    }

    /** An arrow at the edge of the screen towards the nearest meteor cluster (when it is not in sight). */
    _arrow(d, a) {
        if (!d.arrow) {
            const el = document.createElement('div');
            el.className = 'space-arrow';
            el.innerHTML = '<div class="tip">➤</div><div class="txt"></div>';
            d.root.appendChild(el);
            const st = document.createElement('style');
            st.textContent = '#space-hud .space-arrow{position:absolute;transform:translate(-50%,-50%);color:#bfe0ff;font:600 12px system-ui,sans-serif;text-shadow:0 0 3px #000,0 0 6px #000;text-align:center;display:none;white-space:nowrap}#space-hud .space-arrow .tip{font-size:26px;line-height:26px}';
            d.root.appendChild(st);
            d.arrow = el;
        }
        const el = d.arrow;
        if (!a) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
        // which way on the screen: the direction in the camera's own frame (right, up), behind → turned round
        const q = _q.copy(this.view.camera.quaternion).invert();
        const v = a.dir.applyQuaternion(q);
        let x = v.x, y = v.y;
        if (Math.hypot(x, y) < 1e-3) { x = 0; y = -1; } // (straight behind: «turn round», at the bottom)
        const ang = Math.atan2(-y, x), w = innerWidth, h = innerHeight, mx = 130, my = 60; // (room for its words inside the screen)
        const k = Math.min((w / 2 - mx) / Math.max(1e-6, Math.abs(Math.cos(ang))), (h / 2 - my) / Math.max(1e-6, Math.abs(Math.sin(ang))));
        el.style.left = `${w / 2 + Math.cos(ang) * k}px`;
        el.style.top = `${h / 2 + Math.sin(ang) * k}px`;
        el.firstChild.style.transform = `rotate(${ang}rad)`;
        const where = v.z > 0 ? 'позади, ' : '';
        const txt = `☄️ Скопление: ${where}${dist(Math.max(0, a.c._dist))}`;
        if (el._t !== txt) { el.lastChild.textContent = txt; el._t = txt; }
        el.style.display = 'block';
    }

    _say(text, key, ms = 4000) {
        const now = performance.now();
        if (now - (this._msgAt[key] || -1e9) < ms) return;
        this._msgAt[key] = now;
        this.game.hud?.setVoice?.(text, true);
    }

    dispose() {
        this._worker?.terminate?.();
        this._worker = null;
        this._dom?.root.remove();
        this._dom = null;
        this.view?.dispose();
    }
}

const _c1 = new THREE.Color();
const _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Can one breathe there? (the author: the Earth, Venus, Mars, the giants, any terraformed planet) */
export function breathable(def) {
    return !!def && (def.air === 'air' || !!def.terraformed);
}

const DEG = Math.PI / 180;
/** A giant's axis is tilted (Uranus lies on its side): turn round z by its tilt (the view does the same). */
function tiltZ(d, def, sign = 1) {
    const a = def.kind === 'gas' ? (def.tilt || 0) * DEG * sign : 0;
    if (!a) return d;
    const c = Math.cos(a), s = Math.sin(a);
    const x = d.x * c - d.y * s, y = d.x * s + d.y * c;
    d.x = x; d.y = y;
    return d;
}
/** A direction in a planet's own frame → space (its spin, then its tilt), and back. */
function toSpace(d, def, t) { return tiltZ(rotY(d, spinAt(def, t)), def); }
function toPlanet(d, def, t) { return rotY(tiltZ(d, def, -1), -spinAt(def, t)); }

/** Turn a direction round the y axis (a planet's spin). */
function rotY(d, a) {
    const c = Math.cos(a), s = Math.sin(a);
    const x = d.x * c + d.z * s, z = -d.x * s + d.z * c;
    d.x = x; d.z = z;
    return d;
}

/** «12 км», «830 м». */
export function dist(m) {
    m = Math.max(0, m);
    return m >= 10000 ? `${Math.round(m / 1000)} км` : m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} км` : `${Math.round(m)} м`;
}

/** One line about a planet on arrival. */
function planetLine(def) {
    if (!def) return '';
    const air = breathable(def) ? 'воздух есть' : 'воздуха нет — дышите магией';
    return `тяжесть ×${def.gravity}, ${air}${def.storms ? ', бури и сильный ветер' : ''}`;
}

export { PLANETS };
