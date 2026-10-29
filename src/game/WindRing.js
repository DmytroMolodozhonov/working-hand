/**
 * WindRing.js — «Wind Maxima» («Вайнд Максима») with the wand raised UP (or turned at oneself).
 *
 * The same gesture as «Wind Impulse» (WandAim.js): instead of the cone ahead, a ring of wind goes out of
 * the caster in every direction. Whoever and whatever is in reach is blown away from the caster with the
 * force of «Вайнд Максима»; and the wave puts out every fire it runs over — the front travels outward
 * at WIND_RING.SPEED m/s, so a near fire goes out first and a far one a moment later (the wind is seen
 * first; the fire goes out when it reaches it). What burnt down stays burnt.
 *
 * Mana: the same as «Вайнд Максима» (Combat.SPELL_COST). Not held (instant), so no concentration.
 * Network: an ordinary 'spell' (direction (0,1,0), like the Impulse). The front is counted from the
 * moment the spell reaches a computer, the same way everywhere; who puts out what is in WIND_RING_TARGETS.
 */

import * as THREE from 'three';

export const WIND_RING = {
    // 14 m: wider than «Wind Impulse Maxima» (9 m), narrower than «Вайнд Максима» ahead (24 m) — a ring all round
    // is a lot more air than one cone. The hero is ~3.5 m tall, a block is 1 m: 4 heroes' heights.
    R: 14,
    SPEED: 30, // m/s: the front takes ~0.47 s to reach the edge
    PUSH: 39, // m/s at the caster: 13 × 3, as «Вайнд Максима» (SpellManager.castWind power 3)…
    PUSH_RANGE: 24, // …falling off to 40% at ITS 24 m (so at the same distance it pushes the same)
    UP: 0.35, // the lift as part of the push (as castWind)
    WET: 2, // s: a player the wave runs over is not burnt by the Hellfire (the air round them is moving)
    LEFT_SLACK: 0.5, // m: a campfire / a ship's fire counts when the front touches its edge
};

/** Is this the up-variant? («Вайнд Максима» whose direction is straight up — Game._castWind sends (0,1,0).) */
export const isWindRing = (name, dir) => name === 'WindMaxima' && !!dir && dir.y > 0.999;

/** The delay (s) before the front reaches `dist` m from the caster. */
export const ringDelay = (dist) => Math.max(0, dist) / WIND_RING.SPEED;

/**
 * The push at `pos` from a ring at `origin` (null: out of reach): straight away from the caster along
 * the ground and up a little; measured along the ground, like Impulse.
 */
export function windRingPush(origin, pos, out = new THREE.Vector3()) {
    out.set(pos.x - origin.x, 0, pos.z - origin.z);
    const d = out.length();
    if (d > WIND_RING.R || Math.abs(pos.y - origin.y) > WIND_RING.R + 2) return null;
    if (d < 1e-3) out.set(1, 0, 0); else out.divideScalar(d);
    const k = WIND_RING.PUSH * (1 - 0.6 * d / WIND_RING.PUSH_RANGE);
    return out.multiplyScalar(k).setY(k * WIND_RING.UP);
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). Pushes: as «Вайнд Максима» (WindMaxima in Impact.js), instantly at the cast.
 * Fire: out when the front arrives. Who decides: the host — creatures, things, campfires, living trees,
 * ships, carts, dragons; every computer — trees and blocks (Fire.js), its own player, its own Hellfire.
 */
export const WIND_RING_TARGETS = {
    me: { does: 'none', why: 'сам колдующий стоит в центре — ветер его не толкает; огонь вокруг него гаснет, 2 с адский огонь его не жжёт' },
    players: { does: 'push', why: 'других игроков отбрасывает от колдующего (каждый компьютер толкает своего); купол/щит «Protection» держат волну; когда фронт дошёл — 2 с адский огонь их не жжёт' },
    zombies: { does: 'push', why: 'отлетают и падают (CreatureImpact, как «Вайнд Максима»)' },
    castlePeople: { does: 'push', why: 'жители, рыцари, король, волшебники — отлетают и падают; волшебника Мастера защищает купол; не ранит и не пугает как нападение' },
    animals: { does: 'push', why: 'корову толкает слабее, овцу и свинью сильнее (масса CreatureImpact)' },
    sailors: { does: 'push', why: 'на палубе — по палубе в координатах корабля, у борта — за борт; пожар на корабле гаснет, когда фронт дошёл' },
    spider: { does: 'none', why: 'гигантская паучиха слишком тяжёлая — волна только обдаёт её' },
    livingTrees: { does: 'push', why: 'качнётся, корни держат; горящее живое дерево гаснет, когда фронт дошёл (что сгорело — сгорело)' },
    bookBirds: { does: 'knock', why: 'лёгкую книгу-птицу сбивает на землю (книгу защиты — нет)' },
    servants: { does: 'push', why: 'слуги — как их вид: волна не выбирает' },
    dragon: { does: 'push', why: 'только качнётся (Dragons.push); огонь, которым дракон дышит, гаснет — дракон 2 с не может дохнуть и злится на колдовавшего; сам не ранен' },
    iceCastle: { does: 'push', why: 'снеговика сдувает, королеву и монстров только качает; огонь на них не тушится — это ледяной мир' },
    blackship: { does: 'push', why: 'капитан и скелеты держатся стойкой (Sailors.BRACE): сдвиг до полуметра; корабль не повреждается; его огонь и так гаснет сам (проклятие)' },
    phoenix: { does: 'push', why: 'лёгкую птицу отбрасывает; пылающий феникс гаснет и бросает огненную атаку (Phoenixes.watered), без урона' },
    owl: { does: 'push', why: 'сову отбрасывает (со свитка — Owls.TARGETS), без урона' },
    canary: { does: 'push', why: 'кольцо ветра отталкивает канарика (устойчивость как у рыцаря); лагерь сердится на колдующего' },
    spencer: { does: 'none', why: 'птичку Спенсера не задевает: она вспархивает и улетает' },
    custom: { does: 'push', why: 'кольцо ветра отталкивает созданное существо, как зверя его размера' },
    gargoyle: { does: 'push', why: 'кольцо ветра отбрасывает горгулью (устойчивость 20–30), без урона' },
    burningBodies: { does: 'out', why: 'зажжённые существа (Burning.js: игрок, зомби, жители, звери, моряки) гаснут, когда фронт дошёл до них' },
    campfires: { does: 'out', why: 'костёр гаснет совсем, когда фронт дошёл' },
    trees: { does: 'out', why: 'горящие деревья гаснут (что сгорело — сгорело)' },
    blocks: { does: 'out', why: 'горящая трава, листья, дерево, дома и стены замков гаснут' },
    inferno: { does: 'out', why: 'поток «Инферно» (любого волшебника), до которого дошёл фронт, обрывается' },
    fireMaxima: { does: 'out', why: '«Fire Maxima» в полёте и цветок гаснут' },
    hellfire: { does: 'knock', why: 'удерживаемый чьей-то палочкой адский огонь ветер сильно сбивает (меньше и пару секунд не растёт), но не топит — топит только «Firefighting Maxima»' },
    hellfireLeft: { does: 'out', why: 'оставшиеся на земле огни адского огня и секции кольца гаснут целиком' },
    carts: { does: 'out', why: 'горящая повозка гаснет (Carriages.douse)' },
    ships: { does: 'out', why: 'пожар на палубе и парусах гаснет; корпус, паруса и палуба не ломаются; паруса волна не надувает (она короткая и во все стороны)' },
    doors: { does: 'push', why: 'двери в радиусе распахиваются от колдующего (Doors.blow); запертая только дрогнет' },
    items: { does: 'push', why: 'вещи на земле разлетаются; вещь в чужой руке не вырывает' },
    water: { does: 'none', why: 'в воде и так ничего не горит' },
    ground: { does: 'none', why: 'земля не размывается, не копается — это только воздух' },
    godGifts: { does: 'none', why: 'дары богов и храм богов ветер не ломает; заколдованный камень не затрагивает' },
    space: { does: 'none', why: 'без воздуха ветру нечем дуть (Space.spaceSpellBlock: космос и планеты без воздуха — та же причина, что у «Вайнд Максима» вперёд)' },
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/** The fire-putting-out half of the wave: one frame (called by SpellManager's ring through the game). */
export class WindRing {
    constructor(game) {
        this.game = game;
        this.log = []; // events (tests / debugging)
        this._stamp = 0;
    }

    _note(e) {
        this.log.push({ t: Math.round(performance.now()) / 1000, ...e });
        if (this.log.length > 40) this.log.shift();
    }

    /** A new wave: sp = {o: THREE.Vector3, by, t: 0}. */
    begin(o, by) {
        return { o: o.clone(), by, t: 0, front: 0, stamp: ++this._stamp, hit: new Set(), did: false };
    }

    /** One frame of the wave: the front runs on and puts out what it reaches. @returns true while it is still running */
    step(sp, dt) {
        sp.t += dt;
        const front = Math.min(WIND_RING.R, sp.t * WIND_RING.SPEED);
        sp.front = front;
        if (this._douse(sp, front)) sp.did = true;
        return front < WIND_RING.R;
    }

    /** distance from the caster to a point (3D; `y` null: along the ground only) */
    _dist(sp, x, y, z) {
        const dx = x - sp.o.x, dz = z - sp.o.z;
        const dy = y == null ? 0 : y - sp.o.y;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    _douse(sp, front) {
        const g = this.game, o = sp.o;
        this._o = o;
        const auth = !!g.authority;
        let did = false;
        const reached = (x, y, z, r = 0) => this._dist(sp, x, y, z) - r <= front;
        // trees, grass, leaves, wood, houses — the same on every computer (Fire.js)
        const out = (x, y, z) => { this._puff(_v.set(x, y, z), 1); };
        if ((g.fire?.douseWhere?.((x, y, z) => reached(x, y, z, 0.5), out) || 0) > 0) did = true;
        // ships' fires and carts (the host); the wave touches every fire within `front` of the caster
        if (auth) {
            if ((g.ships?.douse?.(o, front + WIND_RING.LEFT_SLACK) || 0) > 0) did = true;
            if ((g.carriages?.douse?.(o, front + WIND_RING.LEFT_SLACK) || 0) > 0) did = true;
        }
        if (auth) {
            for (const cf of [...(g.campfires?.list?.values() || [])]) {
                if (!reached(cf.x, cf.y + 0.4, cf.z, 0.8)) continue;
                g.campfires._out(cf);
                this._puff(_v.set(cf.x, cf.y + 0.4, cf.z), 1.2);
                did = true;
            }
            for (const t of g.livingTrees?.list || []) {
                if (!(t.burnT > 0) || t.phase === 'burn' || t.isDead) continue;
                const p = t.model.position;
                if (!reached(p.x, p.y + 2, p.z, 1.5)) continue;
                t.burnT = 0;
                this._puff(_v.set(p.x, p.y + 2, p.z), 1.5);
                did = true;
            }
            // a burning phoenix: the fire goes out, it gives up its attack (once per wave)
            for (const f of g.phoenixes?.targets?.() || []) {
                if (sp.hit.has(f) || !reached(f.model.position.x, f.model.position.y, f.model.position.z, 1)) continue;
                sp.hit.add(f);
                g.phoenixes.watered?.(f, null, sp.by);
            }
        }
        // «Инферно» streams (anyone's)
        for (const s of g.spells?.spells || []) {
            if (s.kind !== 'Inferno' || !s.flame || !(s.life > 0) || !(s.flame.len > 0)) continue;
            const f = s.flame;
            let on = false;
            for (let j = 0.5; j <= f.len && !on; j += 0.8) { _w.copy(f.o).addScaledVector(f.d, j); on = reached(_w.x, _w.y, _w.z, 0.4); }
            if (!on) continue;
            s.life = 0;
            did = true;
            this._puff(_w, 1.2);
            this._note({ ev: 'inferno', by: s.by });
        }
        // «Fire Maxima»: in flight it goes out, the flower too
        const fx = g.vortex?.effects;
        if (fx) for (let i = fx.length - 1; i >= 0; i--) {
            const e = fx[i];
            if (e.kind !== 'fire') continue;
            const head = e.bloomed ? e.p : _w.copy(e.o).lerp(e.p, Math.min(1, e.t / e.travel));
            if (!reached(head.x, head.y, head.z, e.bloomed ? 3 : 0.6)) continue;
            this._puff(head, e.bloomed ? 2 : 1);
            fx.splice(i, 1);
            did = true;
            this._note({ ev: 'fireMaxima', by: e.by });
        }
        // dragons: their breath is cut off (the dragon itself is not hurt)
        if (auth) for (const dr of g.dragons?.list || []) {
            const b = dr.breath;
            if (!b || dr.dead || !g.dragons._mouth) continue;
            const m = g.dragons._mouth(dr, _w.clone());
            let on = reached(m.x, m.y, m.z, 1);
            for (let j = 1; j <= (b.len ?? 0) && !on; j += 1.5) { _v.copy(m).addScaledVector(b.dir, j); on = reached(_v.x, _v.y, _v.z, 0.8); }
            if (!on) continue;
            dr.breath = null;
            dr.breathCd = Math.max(dr.breathCd || 0, 2);
            this._puff(m, 1.5);
            did = true;
            g.dragons.hit?.(dr, 0, 'Firefighting', sp.by); // (no harm — it only angers it)
        }
        // the Hellfire: this computer's own blaze, the fires left on the ground (every computer keeps them)
        if (g.hellfire?.douse?.((c, r) => reached(c.x, c.y, c.z, r), 0, sp)) did = true;
        // whoever burns where the front is (the people and beasts, me): the fire goes out
        if (g.burning?.douseWhere?.((c, r) => reached(c.x, c.y, c.z, r))) did = true;
        // me: the air round me is moving — for a moment the Hellfire doesn't burn me
        this._me(sp, front);
        return did;
    }

    _me(sp, front) {
        const g = this.game, c = g.combat;
        if (!c || c.dead || sp.me) return;
        const me = c.center ? c.center(_w) : _w.copy(g.character.group.position);
        if (this._dist(sp, me.x, me.y, me.z) > front) return;
        sp.me = true;
        if (g.firefighting) g.firefighting.wetUntil = Math.max(g.firefighting.wetUntil, performance.now() + WIND_RING.WET * 1000);
    }

    /** A fire put out at p (size k): the flames lean away from the caster in a last flicker, a wisp of smoke and a few embers. */
    _puff(p, k = 1) {
        const fx = this.game.fx;
        if (!fx?.smoke) return;
        // (the flames lean away from the caster: the embers fly outward)
        let ox = 0, oz = 0;
        if (this._o) { ox = p.x - this._o.x; oz = p.z - this._o.z; const l = Math.hypot(ox, oz) || 1; ox = ox / l * 3; oz = oz / l * 3; }
        for (let i = 0; i < 8 * k; i++) {
            const a = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 0.8;
            fx.smoke.spawn(p.x + (Math.random() - 0.5) * k * 0.6, p.y + 0.2 + Math.random() * k * 0.5, p.z + (Math.random() - 0.5) * k * 0.6,
                Math.cos(a) * v, 0.6 + Math.random() * 0.6, Math.sin(a) * v, 0x8a8a8a, 0.3 + Math.random() * 0.3 * k, 1.4 + Math.random() * 0.8, { gravity: -0.2, shrink: -0.3, spin: 1 });
        }
        for (let i = 0; i < 4 * k; i++) {
            fx.glow?.spawn(p.x + (Math.random() - 0.5) * k * 0.5, p.y + 0.3 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * k * 0.5,
                ox, 0.2, oz, Math.random() < 0.5 ? 0xff7a20 : 0xffb040, 0.1 + Math.random() * 0.08, 0.5, { shrink: 0.8, spin: 2 });
        }
    }
}
