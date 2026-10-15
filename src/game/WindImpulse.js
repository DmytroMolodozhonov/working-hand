/**
 * WindImpulse.js — «Wind Impulse» / «Wind Impulse Maxima» (only from a scroll — one scroll teaches both).
 *
 * The wand is raised UP (or turned at oneself — WandAim.js) and the words are said: a ring of air
 * bursts out of the caster in every direction — no ball, no ray. Whoever and whatever is within
 * 3 m (Maxima: 9 m) is pushed straight away from the caster, the nearest the hardest. Never hurts
 * by itself (a fall from a ledge does, as after any push). Mana: 10 / 40.
 *
 * Who decides (the network): the spell goes to everybody as a 'spell' message; the host pushes the
 * creatures and the things lying about, every computer pushes its own player.
 */

import * as THREE from 'three';

export const IMPULSE = {
    WindImpulse: { r: 3, push: 16, up: 3 },
    WindImpulseMaxima: { r: 9, push: 30, up: 5 },
    /** a book-bird this near is knocked out of the air (a light book in a gust) */
    BIRD_K: 1,
    /** loose things fly this much faster than bodies are pushed (they are light) */
    THING_K: 0.7,
};

export const isImpulse = (name) => name === 'WindImpulse' || name === 'WindImpulseMaxima';

/**
 * The push at `pos` from an impulse at `origin` (null: out of reach): straight away from the
 * caster along the ground and a little up; full at the caster, a third at the edge.
 */
export function impulsePush(name, origin, pos, out = new THREE.Vector3()) {
    const P = IMPULSE[name];
    if (!P) return null;
    out.set(pos.x - origin.x, 0, pos.z - origin.z);
    const flat = out.length();
    const d = Math.hypot(flat, (pos.y - origin.y) * 0.5); // (a little up or down still counts: a ring of air, not a disc)
    if (d > P.r) return null;
    if (flat < 1e-3) out.set(1, 0, 0); else out.divideScalar(flat);
    const k = P.push * (1 - 0.65 * d / P.r);
    return out.multiplyScalar(k).setY(P.up * (1 - 0.5 * d / P.r));
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). `does`: push | knock | none; `why` in words.
 * Who decides: the host — creatures and loose things; each computer — its own player.
 */
export const IMPULSE_TARGETS = {
    me: { does: 'none', why: 'сам колдующий стоит в центре волны — его не толкает' },
    players: { does: 'push', why: 'других игроков в радиусе отталкивает от колдующего (каждый компьютер толкает своего игрока); поднятый к волне щит «Protection» или купол держит её, сфера дома — тоже' },
    zombies: { does: 'push', why: 'отталкивает (CreatureImpact): ближе — сбивает с ног, дальше — шатаются' },
    castlePeople: { does: 'push', why: 'жители, рыцари, король, волшебники — отталкивает так же (CreatureImpact)' },
    animals: { does: 'push', why: 'тяжёлую корову толкает слабее, овцу и свинью — сильнее (масса CreatureImpact)' },
    sailors: { does: 'push', why: 'моряков на палубе толкает по палубе (в координатах корабля), у борта — за борт' },
    spider: { does: 'none', why: 'гигантская паучиха слишком тяжёлая и держится всеми лапами — волна только обдаёт её' },
    livingTrees: { does: 'push', why: 'живое дерево качнётся (масса 3.5), корни держат — почти не сдвигается' },
    bookBirds: { does: 'knock', why: 'лёгкую книгу-птицу в радиусе сбивает на землю (книга защиты — нет: её сбивают только огонь и лёд)' },
    dragon: { does: 'push', why: 'дракон только качнётся (Dragons.push) — сдуть великана нельзя' },
    phoenix: { does: 'push', why: 'лёгкую птицу отбрасывает далеко (масса 0.4), без урона' },
    servants: { does: 'push', why: 'свои слуги («Брейнрот», живое дерево) — толкает так же, как всех: волна не выбирает' },
    looseThings: { does: 'push', why: 'оружие и вещи на земле разлетаются от колдующего (их физика)' },
    heldThings: { does: 'none', why: 'вещь в чужой руке не вырывает — держат пальцы' },
    doors: { does: 'push', why: 'двери в радиусе распахиваются от колдующего (Doors.blow — сила заклинания, как от «Вайнд»); запертая только дрогнет' },
    ships: { does: 'none', why: 'корпус корабля не сдвинуть; в паруса волна не дует — она короткая (3/9 м) и во все стороны' },
    world: { does: 'none', why: 'стены, деревья, земля, вода — не ломает: это только воздух' },
};
