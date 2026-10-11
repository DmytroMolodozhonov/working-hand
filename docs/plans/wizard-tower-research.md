# Wizard Tower, wizard houses and wandering wizards: design and phased plan

## 0. Summary for the author (in Russian, to pass on as is)

Сделаем так:
- **Башня волшебников (Академия).** Широкая круглая каменная башня. 7 уровней: подвал-хранилище и 6 этажей. По стене вьётся винтовая лестница. Под фиолетовой остроконечной крышей стоит обсерватория.
  - В башне 14 комнат: зал, лавка свитков, библиотека, класс, лаборатория, спальня учеников, кабинет Мастера и другие.
  - Внутри светят кристаллы.
  - Вокруг стоят 4–6 «немного волшебных» домиков. Ферм нет.
  - Башни встречаются в 3–5 раз реже замков и никогда не стоят на земле замка.
- **Волшебники.** Похожи на жителей, но в мантиях, в остроконечных шляпах и с палочкой в руке. С ними можно говорить. Наставник даже объяснит, как колдовать нужное заклинание.
  - Иногда видно, как они практикуются: поднимают книгу Левиосой (иногда неудачно), зажигают Люмос ночью, пускают искры в манекены.
- **Свитки.** В лавке на первом этаже лежат свитки. Берёшь рукой, продавец называет цену, говоришь «да». Цена по силе свитка: от 70 до 380 монет.
- **Защита.** Стражи нет. Кто нападёт, тому волшебники отвечают настоящими дуэльными заклинаниями. Их можно отбить «Protection» или встретить своим заклинанием (будет дуэль).
- **Мастер.** Вдвое сильнее обычного волшебника: здоровья 32 против 16, мастерства вдвое больше, колдует вдвое быстрее. Ещё у него:
  - купол Protection Maxima;
  - порыв ветра, если подойти вплотную;
  - перемещение на расстояние;
  - он быстро приходит в себя от «Остолбеней».
- **Волшебники-странники** иногда встречаются в пути. Продадут свиток, подскажут, где ближайшая башня, могут проводить. Тоже защищаются сами.
- **Мне нужно ваше решение:** чтобы башня была высокой, с остроконечной крышей, миру надо разрешить строить выше. Сейчас предел — 40 блоков. Горы при этом не изменятся.

---

## 1. Constraints found in the code

1. **The height limit and the ground level.**
   - `MAX_LAYER = 40` (`src/world/Terrain.js:142`). A block is 1 m and the player is 4.6 m tall.
   - A floor needs a slab plus 6 layers of air: `_walkable` checks that 5 layers above the floor are free (`CastleLife.js:545`), and the castle keep uses 8–9.
   - I measured (scratch `castF.mjs`, `sim.mjs`): **every castle and almost every possible tower site sits at `F = 0`** (ground layer 0). So a tower can use layers `l ∈ [−8, 39]`.
   - 7 levels plus a cone need `l` up to 55, so `MAX_LAYER` must go to **56**.
   - The mountain cap is `MAX_LAYER - 4` (`Terrain.js:184`). It must be fixed at the old value (`MOUNTAIN_TOP = 36`) so that every existing world, and every save, stays block-for-block the same.
   - Memory: each chunk is a `Uint8Array(32·32·HEIGHT)`. Going from 50 to 66 layers is +32%: about +5 MB at normal view distance, about +10 MB in flight. Meshing only gets dearer in tall chunks, because it reads `c.maxTop`.
   - Fallback if this is refused: 6 levels with a flat roof terrace as the observatory (fits under 40).
2. **Duel charges can only come from players today.** These all assume the caster is the local player or a remote player:
   - `Duel._handOf`, `_playerPos`, `_strength`, `_contact`;
   - `_detectClashes` (`tk !== 'p'`) and `_arriveAtMe` (`o.tk === 'p'`);
   - `Levitation.holdPoint`, which drops a caster whose position is stale.
   
   No villager ever casts. Section 7 lists the exact changes.
3. **CastleLife is already a general "people of a place" engine.** It handles activation, models, paths, `_steer`/`_tryClimb`, hits, death, bars, bubbles, net (`vil`/`vhit`/`vsay`/`cst`/`vtalk`/`vcrime`) and saves. If wizards are CastleLife villagers, all of the following work with them unchanged:
   - Leviosa on bodies (`Levitation.js:90`), weapons and fists (`Game.js:1758`, `onLocalHit`);
   - blast and ray spells (`hitAt`/`hitRay`), duel targeting (`Duel.findTarget` kind `'v'`);
   - doors (`Houses._updateDoors`), talk and trade (`CastleTalk`), saves (`castles` snapshot).
4. **Castles.js internals are private.** `Plan`, `buildHouse`, `rotLot`, `hash01` and `BLEND` need `export` (one word each).
5. **Circular import.** `Terrain.js` and `Castles.js` import each other. This only works because nothing at module top level reads `BLOCK`. The new `WizardTowers.js` must follow the same rule: style tables built inside functions.
6. **Placement density** (scratch `sim.mjs`, 4 seeds):
   - Castles: about 1.15 per km².
   - Towers with a 1200 m cell, 80% of cells trying, 12 tries per cell: **12–20 towers in 7.2×7.2 km (0.23–0.39 per km²), so 3–5× rarer than castles**.
   - The nearest tower to spawn was 362–1312 m away.
   - Main reasons a try fails: castle land (~30%), rough or wet ground (~60%).
7. **Voice echo.** A wizard saying «Вингардиум Левиоса!» or «Остолбеней!» through the speakers could be heard by the player's microphone and cast a spell. Every computer that shows or voices an NPC spell line must call `g.voiceGate.noteRemote(spell, now)`. The host must do it too, because the `duel` handler only runs for received messages.
8. **Overlaps with pending tasks:**
   - #121 (Avada Kedavra only from a scroll): the shop table already has a slot for it.
   - #123 (mana instead of fatigue): the NPC "mana" here uses the same idea.
   - #124 (mana crystals in caves): the tower's crystal blocks are decorative lamps (`ARCANE_LAMP`), named so they are not confused with mana crystals.
   - #109 (lie on a villager's bed): the dormitory has real `Beds`.

---

## 2. Placement: `src/world/WizardTowers.js` and the `SiteIndex` facade

### Constants and rules

```js
export const TOWER_CELL = 1200;     // one possible tower per 1200×1200 m cell
const TOWER_GATE = 0.8;             // share of cells that try (the 4 cells round spawn always try)
export const TOWER_ZONE = 58;       // half-size of the levelled land (tower + plaza + ring road + houses)
const MIN_SPAWN_DIST_T = 300;       // + TOWER_ZONE
const TRIES = 12;
```

A try is accepted only if all of these hold:
- not inside a castle's land (with margin): `castles.near(X, Z, TOWER_ZONE + BLEND + 16).length === 0`, which keeps 16 m between the two blend skirts;
- on the 8 m sample grid: no height above 9, at most 15% water, and the 90th minus 10th height percentile at most 6;
- `F = 0` always. The sims gave 0 or 1; levelling to 0 at most digs one layer.

This depends only on the seed and the castle index, which is itself deterministic, so every computer gets the same towers.

```js
export class TowerIndex {
    constructor(seed, rawHeight, castles) { this.seed = seed; this.raw = rawHeight; this.castles = castles; this.cells = new Map(); this._lastCell = null; this._wander = new Map(); }
    cellOf(gx, gz) { const k = gx * 65536 + gz; if (!this.cells.has(k)) this.cells.set(k, this._makeTower(gx, gz)); return this.cells.get(k); }
    _makeTower(gx, gz) {
        const nearSpawn = gx >= -1 && gx <= 0 && gz >= -1 && gz <= 0;
        if (!nearSpawn && hash01(gx * 3 + 5, gz * 7 + 1, this.seed + 1700) > TOWER_GATE) return null;
        const rng = createRng((this.seed * 31337 + gx * 7919 + gz * 104723) >>> 0);
        const H = this.raw, m = TOWER_ZONE + BLEND + 10, span = TOWER_CELL - 2 * m;
        for (let t = 0; t < TRIES; t++) {
            const X = Math.round(gx * TOWER_CELL + m + rng() * span), Z = Math.round(gz * TOWER_CELL + m + rng() * span);
            if (Math.hypot(X, Z) < MIN_SPAWN_DIST_T + TOWER_ZONE) continue;
            if (this.castles.near(X, Z, TOWER_ZONE + BLEND + 16).length) continue;
            if (!flatDryGround(H, X, Z, TOWER_ZONE)) continue;              // h ≤ 9, wet ≤ 15 %, p90−p10 ≤ 6
            return buildTowerSite(this.seed, gx, gz, X, Z, 0, rng);
        }
        return null;
    }
    near(x, z, r = 0)       { /* same as CastleIndex.near with TOWER_CELL */ }
    landAt(ix, iz)          { /* same as CastleIndex.landAt (one-cell cache) */ }
    partsForChunk(cx, cz, C){ /* same as CastleIndex.partsForChunk (def._byChunk cache) */ }
    wanderDef(gx, gz)       { /* §6: a deterministic 'ww' pseudo-site per 700 m cell (no land, no parts) */ }
}
```

### `src/world/Sites.js`, used everywhere the castle index is used today

```js
export class SiteIndex {
    constructor(castles, towers) { this.castles = castles; this.towers = towers; }
    near(x, z, r = 0) { return this.castles.near(x, z, r).concat(this.towers.near(x, z, r)); }
    landAt(ix, iz) { return this.castles.landAt(ix, iz) || this.towers.landAt(ix, iz); }
    partsForChunk(cx, cz, C) { return this.castles.partsForChunk(cx, cz, C).concat(this.towers.partsForChunk(cx, cz, C)); }
    byId(id) {                      // for guests building villagers from 'vil'
        let m = /^(cs|wt|ww)(-?\d+)_(-?\d+)$/.exec(id); if (!m) return null;
        return m[1] === 'cs' ? this.castles.cellOf(+m[2], +m[3]) : m[1] === 'wt' ? this.towers.cellOf(+m[2], +m[3]) : this.towers.wanderDef(+m[2], +m[3]);
    }
    nearestForMap(p, r = 900) {     // nearest 2 castles + nearest tower, each with .icon
        return [...this.castles.nearestForMap(p, r).map((c) => ({ ...c, icon: '🏰' })), ...this.towers.near(p.x, p.z, 1600).sort(byDist(p)).slice(0, 1).map((t) => ({ ...t, icon: '🧙' }))];
    }
}
```

### `TerrainData.generate` changes

- `this.towers = new TowerIndex(seed, raw, idx)` and `this.sites = new SiteIndex(idx, this.towers)`.
- `heightAt` uses `this.sites.landAt`.
- `_buildCastles` uses `this.sites.partsForChunk`.
- `_plantTrees` skips `this.sites.landAt`.
- `this.castles` stays as it is, for old callers and tests.

Callers to switch to `sites`:
- `CastleLife.index`, `Houses.index`;
- `Animals.js:211`;
- `Game.js:624` (indoor lighting, so the tower and its cellar are lit as a building and not as a cave);
- `Game.js:1786` (minimap).

---

## 3. Tower architecture: `buildTowerSite` and `buildTower`

### New engine pieces (Phase 0)

- **Sector part.** `Plan.sector(u, v, r, hr, a0, a1, l0, l1, t)` creates part `{k: 2, cx, cz, r, hr, a0w, span, ...}`.
  - The world angle is the local angle plus `rot·π/2`. This follows from `Plan.wx`/`wz`: rot 1 maps (u, v) to (−v, u), which is +90°.
  - `Terrain._buildCastles` gets a branch: `if (p.k === 2) { let a = Math.atan2(z - p.cz, x - p.cx) - p.a0w; a -= Math.floor(a / TAU) * TAU; if (a >= p.span) continue; }`. This is checked after the ring test that `cyl` already uses.
- **New blocks** (ids ≥ 20, so `isCastleBlock` holds and wrecking them is a crime):

| id | name | colour | pattern |
|---|---|---|---|
| 49 | `ARCANE` | 0x56597f | ASHLAR |
| 50 | `ARCANE_DARK` | 0x3b3d5c | ASHLAR |
| 51 | `ROOF_PURPLE` | 0x5b2d8e | TILES |
| 52 | `ARCANE_LAMP` | 0x8fe3ff | **CRYSTAL (12)**, glows |
| 53 | `ARCANE_LAMP_VIOLET` | 0xc58bff | CRYSTAL, glows |
| 54 | `CARPET_PURPLE` | 0x6a2c91 | CLOTH |
| 55 | `POTION` | 0x5dff8a | GLOW (11) |
| 56 | `RUNE` | 0x2e3150 | **RUNES (13)**, faint glow |

- **`VoxelShading.js`:**
  - `pat == 12.0`: diagonal facets, `diffuse *= 0.8 + 0.4*step(0.5, fract((uv.x+uv.y)*2.0))`.
  - `pat == 13.0`: dark slab with a thin glowing circle, `abs(length(fract(uv)-0.5)-0.32) < 0.03`.
  - Emissive: `pat==11||pat==12` adds ×0.9; `pat==13` adds ×0.5 times the rune mask.

### Dimensions (rot-local; tower centre (0, 0); door at the front, −v)

- **Drum:** outer R 17, wall 2, inner radius 15.
- **Levels** (`FLOOR_H = 7`, slab plus 6 air layers): `LEVELS = [−7, 0, 7, 14, 21, 28, 35]`.
  - The cellar's floor slab is at −8, so world layer −7 stays above `MIN_LAYER` (−9).
  - Roof slab at 41. Cone from radius 18.5 at l 41 up to l 54. Glowing finial at l 55 (world layer 56 = `MAX_LAYER`).
  - Thin `CS_WHITE` string course outside every slab: `cyl(17.5, l−1, l−1, band, 16.5)`.
  - 4 buttresses on the diagonals (2×2 boxes, l −1…8).
  - 6 `GOLD` "stars" on the cone.
- **Spiral stair along the wall.** This is real spiral stairs, with steps that are sector parts.
  - It runs in the band r 11.5–15 (3.5 m wide).
  - Each step is 2.6 m of arc at r 13.25 (Δ = 11.2°) and rises 1 layer. 7 steps per floor; the next flight starts +9Δ (101°) further round, so the stair spirals up the whole tower.
  - Headroom carve per step: `sector(15, 11.5, θ+iΔ, θ+(i+1)Δ, l+i+1, l+i+5, AIR)`. This also cuts the hole in the slab above. Then the step itself: `sector(..., l, l+i, ARCANE_DARK)`.
  - Railing on the floor above: the inner arc (r 10.5–11.5) and the closed start end over step 0, both `FENCE`, 2 high.
  - **Checked by the scratch prototype `towerproto.mjs`** with the same checks as `tests/unit/castles.test.js`:
    - θ0 = 20°: 184 nodes, 0 walk problems, all nodes reachable, top study and cellar reachable.
    - Some other θ0 values give 3 problems: a landing exactly on the divider line.
    - Rule: **θ0 = 20° fixed** (variety comes from `rot`). With it every flight end is at least 12° from the divider.
    - Flights per level, rot-local: cellar→G0 holes at 20–98° (back-right, away from the front door at −90°); G0→F1 starts at 121°; and so on.
- **Rooms.** Each level has a divider wall along v = 0 (u −11…11, 6 high) with a 3-wide doorway in the middle. That gives two half-rooms (`back` v > 0, `front` v < 0), both open to the band. 14 rooms in total:

| level | l | back half | front half |
|---|---|---|---|
| cellar | −7 | **Хранилище (vault)**: 3 locked chests `room:'vault'`, gold, rune circle | **Кладовая**: crates, hay, potion shelf |
| G0 | 0 | **Большой зал**: 2 long tables + benches, floating `ARCANE_LAMP` chandelier ring at l 5, purple banners | **Вестибюль + Лавка свитков**: counter `PLANKS_DARK` u −9…−5, v −7…−6, 2 high; `BOOKS` behind; rune circle at the door |
| F1 | 7 | **Библиотека**: `BOOKS` 5 high along the divider + short radial shelves r 4–9, reading tables | **Читальня**: lecterns, armchairs (`CARPET_PURPLE`), crystal globe |
| F2 | 14 | **Класс заклинаний**: 3 rows of desks facing a lectern by the divider, chalkboard `CS_DARK` on the divider, **2 training dummies** (hay on a fence post) → `out.dummies` | **Учительская**: table, chairs, shelves |
| F3 | 21 | **Алхимическая лаборатория**: 2 cauldrons (COBBLE ring r 1.5 + `POTION`), crystal shelves → `out.spots` kind `'cauldron'` | **Травница**: planters (FLOWERS/VEG on planks), hanging herbs (`WHEAT` at l 5) |
| F4 | 28 | **Спальня учеников**: 6 `bedSpots`, purple (real Beds) | **Гостиная**: carpets, fireplace, armchairs, a 2×2 chessboard |
| F5 | 35 | **Кабинет Мастера**: desk with gold trim, the Master's seat (`def.throne` with yaw), crystal ball, shelves, 1 locked chest `room:'study'`, star chart in `RUNE` | **Обсерватория**: `GOLD` telescope tube stepping up into a dormer cut in the cone (u −2…2, l 41…44, front) |

- **Furniture** goes through `furnishTower(p, room, s, out, aisles)`, which copies `furnish()` from `Castles.js:221`. Aisles are the walking-graph legs, and nothing is placed in the band.
- **Windows.**
  - Each level except the cellar: 3 windows (2 wide × 4 high) on the ±u and +v axes through the 2-thick wall, recorded like `buildHouse`'s `win()` so they get glass. F5 has 8 windows.
  - `ARCANE_LAMP` blocks in the wall every ~6 m, at l + 4.
- **Entrance.** Door opening u −2…2, l 0…5, through the wall at the front. `ARCANE_DARK` frame pillars at u ±3, l 0…7, with a lamp keystone. Two lamp pillars at (±5, −20).
- **Grounds** (`buildGrounds`):
  - plaza disc r 26 in COBBLE at l −1, with a glowing `RUNE` ring at r 21–22 and 4 crystal obelisks on the diagonals (r 23);
  - square ring road at |u| or |v| = 33 (3 wide `PATH`, using `roadLine` + `joinRoads` exactly like `buildVillage`);
  - entrance road from v −58 to the plaza, with lamp posts (FENCE 3 high + lamp) every 10 m;
  - gate arch at v −52 (pillars u ±4 l 0…8, lintel l 8…9, hanging violet lamp).
- **Walking graph** (pattern taken from the prototype):
  - per level: 2 room centres `(0, ±6)` tagged `room:<kind>`, doorway nodes `(0, ±1)`;
  - 12 band nodes at r 13.25 every 30°, leaving out any node or arc that touches that level's blocked sectors (steps or hole);
  - each band node links to the room centre **through a radial node at r 9**, so lines never cut a railing;
  - stairs: `stairsBottom` → 7 step nodes, each 1 layer higher → `landing` on the next level → next `stairsBottom`;
  - tags: `towerGate` (0, −22, outside), `towerIn` (0, −12), `stall` (counter front), `room:study`, `room:classroom`, `room:library`, `room:hall`, `room:dorm`, `cauldron`, `dummy`, `ring` (outside road), `home` (house insides).

### Site record (same shape as a castle def, so CastleLife, CastleTalk and Houses keep working)

```js
{ id: `wt${gx}_${gz}`, kind: 'tower', gx, gz, x: X, z: Z, F, rot, name, king: masterName, master: masterName,
  color: 0x6a2c91, colorName: 'фиолетовые', stone: BLOCK.ARCANE, zone: TOWER_ZONE,
  walls: p.rect(-18, 18, -18, 18), inner: p.rect(-15, 15, -15, 15), door: p.pt(0, -22), doorIn: p.pt(0, -12),
  population, knights: 0, teachers,                                  // 24–48 wizards, 3–5 teachers
  throne: masterSeat, throneFront, posts: nightWatchPosts,           // posts: 2 at the door (night watch)
  rooms, chests /* vault + study, ids `${id}_ch${i}` */, houses /* cottages + the tower pseudo-house (last) */,
  stalls: [scrollCounter], fields: [], pens: [], market: null, wallWalk: [],
  dummies, spots /* {x,y,z,yaw,kind:'desk'|'lectern'|'cauldron'|'shelf'|'telescope'} */, beacon: p.pt(0, 0, 56),
  nodes: p.nodes, edges: p.edges, parts: p.parts, topL: 56, _byChunk: new Map() }
```

- **Tower pseudo-house** (last entry of `houses`): `{ kind: 'tower', rich: true, wizard: true, id: `${id}_h${n}`, c, r: 18, doorRec: null, windows, chests: [], bedSpots: dorm6, homeNode: dormNode, door, inside: dormPt, beds: 6, bedColour: 'purple' }`.
  - Houses.js then glazes the tower windows and places the dormitory beds with no code change.
  - `spawnFamily` puts students to bed in the dormitory.
- **Names.**
  - Tower: `['Звёздный','Лунный','Туманный','Сапфировый','Аметистовый','Северный','Хрустальный','Сумеречный','Небесный','Старый'] × ['Шпиль','Купол','Свиток','Посох','Пик']` → «Академия «Лунный Шпиль»».
  - Master: `['Элдрин','Корвин','Северин','Аурелий','Мирабель','Ингвар','Октавиан','Велимира','Радомир','Мелисандра'] + ['Седобородый','Звездочёт','Мудрый','Огненный','Тихий','Всевидящий','Лунный']`.

---

## 4. Wizard houses (`buildWizardHouses`)

- **Lots** are outside the ring road, facing it, the same way `addLots` works in villages:
  - left u = −43 (`face 1`) at v −10 and +12;
  - right u = +43 (`face 3`);
  - back v = +43 (`face 0`) at u −12 and +12;
  - 4–6 lots chosen by rng, so up to 49 m from the centre, inside `TOWER_ZONE` 58.
- **Kinds:** `['cottage','manor','towerhouse','cottage','stone']`. The towerhouse gives a small-tower look with a purple pyramid roof.
- **Style:** `buildHouse(p, kind, u, v, face, rng, wizStyle, out)` with `wizStyle = { houseStone: ARCANE, villageRoof: ROOF_PURPLE, poorRoof: ROOF_PURPLE (35 % ROOF_BLUE), poorWall: PLASTER, roof: ROOF_PURPLE, carpet: CARPET_PURPLE, bedRich: 'purple' }`.
- **`decorateWizardHouse(P, house, rng)`** runs after `buildHouse`, with the same lot-local `P` helper (pass `P` out of `buildHouse` or rebuild it with `rotLot`):
  - a violet lamp on the roof ridge, a blue lamp beside the door;
  - a cauldron (COBBLE + POTION) next to the hearth;
  - a crystal ball on the table, a bookshelf;
  - a herb planter under the front window.
  - **No woodpile, yard, pen, barn or field** ("they have no farms").
  - `house.wizard = true`.
- **Loot:** house chests have `chest.house.wizard` set. `Items.lootChest` calls `rollWizardHouseLoot(rng, rich)` (ItemTypes):
  - 1–3 items: hp/fatigue scrolls 55%; a spell scroll (To the Sun 45%, Thunderwave 35%, Lightning Strike 20% of that share) 9%; flight scroll 3%; a spell book (`{kind:'book', id}`) 10%; plain wand 5%; otherwise food;
  - coins 10–60.
- **Theft** works through the existing `Houses.chestOpened` → `CastleLife.theft()`. In a tower def it goes to `WizardLife.offence`, and the house's own wizard defends with spells.

---

## 5. Wizard NPCs

### Roles, roster, stats (`src/game/WizardAI.js`, pure and node-testable)

```js
export const WIZARD_ROLES = ['student', 'teacher', 'seller', 'master', 'wanderer'];
export const WIZ = {
    student:  { hp: 12, ward: 0,  mana: 30, regen: 1.0, skill: 0.8, cast: 3.2, react: 0.35, reactT: 0.7,  stunK: 1.0, range: [7, 14],
                spells: { Stupefy: 0.5, SapiraDuel: 0.5 } },
    teacher:  { hp: 16, ward: 10, mana: 40, regen: 1.5, skill: 1.0, cast: 2.2, react: 0.6,  reactT: 0.45, stunK: 0.7, range: [8, 16],
                spells: { Stupefy: 0.3, SapiraDuel: 0.35, IceDuel: 0.2, LevitateDuel: 0.15 } },
    seller:   null /* = teacher */, wanderer: null /* = teacher, range [8, 18] */,
    master:   { hp: 32, ward: 20, mana: 80, regen: 3.0, skill: 2.0, cast: 1.1, react: 0.9,  reactT: 0.25, stunK: 0.4, range: [10, 20],
                spells: { Stupefy: 0.25, SapiraDuel: 0.4, IceDuel: 0.2, LevitateDuel: 0.15 },
                dome: { hp: 3, t: 6, cd: 25, cost: 20 }, wind: { r: 4.5, cd: 6, cost: 10 }, blink: { cd: 20 }, heal: 0.25 /* HP/s out of a fight */ },
};
export const ROLE_RU = { student: ['Ученик', 'Ученица'], teacher: ['Наставник', 'Наставница'], seller: ['Торговец свитками', 'Торговка свитками'], master: ['Мастер', 'Мастер'], wanderer: ['Странник', 'Странница'] };
export function wizardRoster(def, idx) { /* like rosterEntry: idx 0 master, 1..T teacher, next stalls.length seller, rest student;
   teachers' home = a cottage, students' home = the tower pseudo-house; wanderer defs: every idx 'wanderer' */ }
export function duelStrength(role, mana, hp, luck) { const W = WIZ[role]; return W.skill * (mana / W.mana) + 0.35 * (hp / W.hp) + luck; }
```

- "Twice as strong" is set against the average wizard, the teacher: HP 32 vs 16, ward 20 vs 10, skill 2.0 vs 1.0, cast interval 1.1 s vs 2.2 s, mana 80 vs 40.
- A teacher at full strength equals a full player in a clash (1.35, the same formula as `Duel._strength`).
- The Master is 2.35. Players beat him by tiring him out (dome, wind and blink all cost mana), by blocking, or with fatigue-bonus scrolls.

### Model (`src/entities/VillagerModel.js`)

- **Lists:** `ROLES` += the 5 wizard roles; `TOOLS` += `'wand'`, `'staff'`; `MODES` += `'cast'`, `'practice'`, `'shield'`, `'offer'`.
- **`villagerLook` cases for wizard roles:**
  - `L.dress = true` (a robe, for both genders) and `L.dressColor = robe`;
  - robe colours: student `[0x2c4f9e, 0x2f7a3e, 0x8e2b2b, 0xb8922a]`, teacher deep blue or violet, Master `0x3a1d5e` with gold trim, wanderer grey or brown;
  - hats: `'wizard'` (brim 1.6×0.1×1.6 at y 1.25 + 4 tiers 1.0/0.75/0.5/0.3, each 0.4 high, leaning back, a bent tip, a band in accent colour); Master `'wizardTall'` (5 tiers + GOLD star and moon boxes); wanderer `'wizardWide'` (wide grey brim);
  - Master gets a long white beard (new beard `'long'`, grey hair);
  - `L.tool = 'wand'`; wanderer also gets `leftTool 'staff'`.
- **Wand geometry:** handle 0.09×0.3 dark wood, shaft 0.06×0.75, tip box 0.07 (crystal colour for the Master). `WAND_TIP_Y = 1.05`, so about 1.2 m, the same as the player's 2.2× scaled wand.
- **New methods:**
  - `getWandTip(out)` → `this.tool.localToWorld(out.set(0, WAND_TIP_Y, 0))`;
  - `setAim(pitch)` tilts `aRX` towards the target's height.
- **Poses:**
  - `cast`: `aRX = 1.45 + aimPitch`, `wrist = −1.45` (the wand continues the forearm towards the target), plus a flick (−1.75 for 0.12 s) when `castNow` is set;
  - `practice`: slow swish-and-flick (`aRX 1.1+0.3 sin t`, `aRZ −0.3 sin 2t`);
  - `shield`: left arm forward, palm out;
  - `offer`: left hand held forward at chest height (the wanderer's scroll).
- All in the shared material, at most 16 meshes (hat in the head mesh, wand as one tool mesh). The unit test's height cap becomes per role: wizard hats ≤ 4.4.

### Jobs and schedule (`WizardLife.wake` / `crowd`, host only)

Day (`dayPhase < 0.75`):
- **Master:** at his desk in the study (`def.throne`, job `post`, mode `sit`). Every 3–5 min he moves to the observatory telescope (job `post` at the `telescope` spot, practice sparkles).
- **Teachers:** one at the classroom lectern (job `teach`: `talk`, sometimes demonstrates sparks at a dummy); one at a cauldron (job `brew`: `work` + green bubbles); the rest wander (library ↔ hall ↔ home cottage).
- **Seller:** at the counter (job `stall`, the same as market merchants).
- **Students:** 3 at desks (job `class`, practice), 2 in the library; the crowd walks tower rooms ↔ plaza ↔ houses (job `wander`, reusing `_nextTrip` with tags `room`, `stall`, `dummy`, `ring`, `home`).
- Crowd size: `want = Math.round(Math.min(12, 4 + pop/6) * (night ? 0.3 : 1) * q)`.

Night:
- Students sleep in the dorm (not active).
- 2 teachers on watch at the door posts with Lumos. They cast Sapira at zombies within 25 m; the existing referee `_arriveAtZombie` decides those hits.
- The Master stargazes. The seller is gone ("Закрыто до утра").

### Practice spells (cosmetic, `src/fx/WizardFx.js`)

- Only near the player (≤ 40 m), at most 3 at once, never while the site is hostile.
- Started by the host at the end of a wait (`waitT`), 15% chance. Shown on every computer from `v.fx` bits sent in `vil`:
  `FX = { LUMOS:1, SHIELD:2, DOME:4, LEV:8, SPARK:16, DRAW:32, CAST:64, BLINK:128, OFFER:256, BREW:512 }`.
- **Leviosa:** a book, feather or apple prop (`makeItemModel`/`BookModel`, pooled ×6) floats at `tip + aimDir·2.2 + (0, 0.6 + 0.25 sin 2t, 0)` with gold sparkles from the tip.
  - 15% of student tries fail: the prop rises 0.5 m, wobbles and drops. The teacher says «Не Левиоса́, а Леви́оса!».
  - Teachers in the library send a book along an arc from a table to a shelf.
- **Lumos:** an additive glow sprite at the tip at night. No new PointLights; WandMagic's 2 lights stay for players, because adding lights recompiles shaders.
- **Sparks:** 0.3 s of `duel._drawBolt(spell, tip, dummy, v.id)`, drawing only (no bolt, no hit, nothing over the network). The dummy is `def.dummies` nearest to `v.post`.
- **Drawing («Латин Вратин»):** a short glowing trail behind the tip (SegmentPool).
- **Brewing:** green bubbles over `POTION`.
- **Spoken words:** the bubble line is the spell word (e.g. «Вингардиум Левиоса!»), and `g.voiceGate.noteRemote(...)` is called wherever it is shown.
- **Beacon (optional, author's taste):** a faint violet light column above the finial (`fog: false`, additive, 3×60 m, opacity 0.12, pulsing), visible up to 400 m at dusk and night. It helps people "come across" a tower despite the 90 m fog.

### Talk (`src/game/VillagerBrain.js`)

- **Roles and pools:**
  - `ROLES` += wizard roles; `ROLE_RU` and `ROLE_TOPICS` for each, e.g. student «учёба, экзамены, Мастер строгий, заклинания не выходят», Master «древняя магия, звёзды, равновесие, ученики».
  - New pool layer `P.wizard`, looked up between the role pool and `P.common`. `_pool` order: `[P[role], this.wizard ? P.wizard : null, P.common]`.
  - `P.wizard` overrides the castle-centred keys: `whereMarket` → the scroll shop, `whereThrone`/`whereKing` → the Master's study, `aboutCastle` → the academy and its floors, `food`, `magic`, `zombies`, `witness*` («Мастер! На нас напали!» instead of «Стража!»), `notMerchant` → «Свитки продаёт {seller} внизу, в лавке».
- **Ruler words:** world `{ kind: 'tower', rulerWords: ['Мастер','Мастера','Мастеру','Мастером'] }`. `_fill` uses them for `{ruler}`/`{rulerG}`/…, and `{castle}` = the tower name.
- **New intents** in `INTENTS` + `detectIntent`:
  - `where_shop` (лавк|свитк|магазин) → action `guide:shop` (tag `stall`);
  - `where_master` (мастер|глав|директор) → `guide:master` (tag `room:study`);
  - `teach_spell` (научи|как (колдовать|сделать)|заклинани).
- **Teaching:** teachers and the Master look up `SPELLS` imported from `src/ui/Codex.js`. It is DOM-free at import (only the render functions touch `document`). They answer `«${s.name}»: ${s.say}.` plus the first sentence of `desc`, for example «Protection: вытяни руку и скажи «Protection»…». This works as an in-world tutorial.
- **Trading:** `this.trader = ['merchant','seller','wanderer'].includes(role)` replaces `role === 'merchant'` in `_onTrade`, `_greetLine`, `ambient` and talkativeness. `noMagicSell` does not apply to traders of scrolls.
- **LLM persona:** `buildSystemPrompt` for wizard roles: `Ты — {name}, {role} в академии волшебников «{tower}». Глава академии — Мастер {master}.`
- **Wanderer context:** `ctx.nearestTower` / `ctx.nearestCastle` = `{name, dirWord: 'на северо-востоке', dist: 800}`.
- **Voices** (`src/audio/Speech.js` `ROLE_VOICE`): student higher and quicker, teacher calm, Master slow and low, seller lively, wanderer slow.

### Trade: the scroll shop (`CastleTalk.js` + `ItemTypes.js`)

- **Restocking:** `_restock` uses a goods table chosen by `cs.def.kind`. For towers, `rollShopScroll(rng)` fills 3 scrolls per counter: common 70% (hp / fatigue), spell 25%, flight 5%. It restocks every 90 s and is deterministic per (tower, slot, 10-minute window), like market goods.
- **Buying** is the same physical flow as the market: take the scroll from the counter by hand → the seller names the price → «да».
- **Prices.** Every shop price is higher than what a castle merchant pays (`itemValue`), so there is no buy-here, sell-there coin loop. A unit test checks this.

| scroll | price at the tower | `itemValue` (merchant pays) |
|---|---|---|
| health +n (1–5) | 70 + 10n (80–120) | 60 |
| strength +n (1–10) | 65 + 5n (70–115) | 60 |
| To the Sun | 240 | 220 |
| Thunderwave | 260 | 220 |
| Lightning Strike | 320 | 220 |
| Flight | 380 (rare on the counter; the Master sells it by voice) | 220 |
| *(task #121)* Avada Kedavra | 500, Master only, never to a hostile player | 220 |

- **NPC-held goods** (the Master by voice, wanderers):
  - The NPC holds the scroll out. A loose scroll with `shop: { npc: v.id, price }` hovers at its `offer` hand.
  - `tookGood(item)` gets `if (item.shop.npc) v = this.life.byId.get(item.shop.npc)`.
  - `_watchMarket` treats a walk-away as theft when more than 14 m from that NPC. The NPC shouts «Вор!» and fights; there are no guards.
- **`_merchantOf`** accepts the `seller` role.

### Self-defence (`src/game/WizardLife.js` runtime + `WizardAI.decide` / `react`)

**Triggers.** `CastleLife._offence` → `WizardLife.offence(cs, by, victim, killed, pos)` for `kind 'tower' | 'wander'`:
- Witnesses within `SEE` (32 m) with line of sight, plus the victim if alive.
- Teachers, seller, Master and wanderers set `foe = by` and say «Защищайся!» / «Ты пожалеешь, что пришёл сюда!».
- Students with `brave < 0.55` (trait from the seed) flee into the tower or houses calling «Мастер! Помогите!». The rest fight.
- Alarm: teachers within 60 m come.
- The Master comes if the attack is inside the land. He **blinks**: violet smoke at both ends, `FX.BLINK`, then appears at a graph node 10–14 m from the attacker with line of sight (cooldown 20 s).
- `cs.hostile` lasts 180 s, as in castles. Guests get `valarm` with `kind: 'tower'` → «✨ Волшебники защищаются!».
- Wrecking blocks (`damaged`): teachers come and investigate, like knights.

**Fight loop** `WizardLife.fight(v, dt)`, replacing `_fight` for wizards:

```js
fight(v, dt) {
    const fp = this.life._playerPos(v.foe);
    if (this._lost(v, fp)) { v.foe = null; return; }          // out of land + 30 m (wanderer: 50 m / 60 s)
    const W = WIZ[v.role] || WIZ.teacher, d = Math.hypot(fp.x - v.x, fp.z - v.z);
    v.aimDir = this._aim(v, fp);                                // wand tip → foe centre; model.setAim(pitch)
    v.mana = Math.min(W.mana, v.mana + W.regen * dt);
    const act = decide({ role: v.role, hp: v.hp, maxHp: v.maxHp, mana: v.mana, dist: d, sees: this.life._sees(v, fp),
        foeStunned: this._foeHelpless(v.foe), hurtAgo: (now - v.hurtAt) / 1000, castCd: v.castCd -= dt,
        domeCd: v.domeCd -= dt, domeOn: v.dome?.until > now, windCd: v.windCd -= dt, blinkCd: v.blinkCd -= dt,
        inClash: this._inClash(v), foeUsedAvada: v.cs.avadaBy?.has(v.foe) }, this.rng);
    switch (act.a) {
        case 'cast':  this._cast(v, act.spell, { kind: 'p', id: v.foe }); v.castCd = W.cast * (0.85 + 0.3 * this.rng()); break;
        case 'dome':  this._dome(v); break;                       // Protection Maxima: FX.DOME, absorbs 3 / 6 s, cost 20
        case 'wind':  this._wind(v, fp); break;                   // g.spells.cast('Wind', tip, dir, 'right', v.id) + sync.spell(..., v.id)
        case 'blink': this._blink(v, fp); break;
        case 'move':  this.life._steer(v, act.x, act.z, act.run ? RUN : WALK, dt); break;   // keep the range band, strafe
        case 'flee':  v.foe = null; v.fleeFrom = fp.id; v.fleeT = 12; break;
        case 'hold':  if (v.sayT <= 0) this.life._say(v, 'Уходи и не возвращайся!'); break;   // mercy rule
    }
    v.mode = act.a === 'cast' || v.castShow > 0 ? 'cast' : v.speed > 0 ? 'run' : 'cast';
    this.life._ground(v);
}
```

**`decide` rules** (pure, each one a unit test):
1. A student flees when HP < 30% or when not brave.
2. In a clash: keep the wand on the foe (`{a:'clash'}`). A student gives up (`v.duelGiveUp`) when losing below p 0.2 with mana < 5. The Master never gives up.
3. Master: `dome` when the dome is ready and (HP < 60% or ≥ 2 charges are coming); `wind` when the foe is closer than 4.5 m; `blink` when the foe has stuck within 3 m for more than 1.5 s.
4. **Mercy rule:** `hold` if the foe is stunned, frozen or lifted, unless this wizard was hurt in the last 5 s. Wizards defend; they do not finish people off.
5. `move` when outside `W.range`, or when there is no line of sight (sidestep 3 m and re-check).
6. `cast` when the cooldown is ready, mana ≥ cost (`SPELL_COST` = Combat's costs) and the foe is in sight. The spell comes from `pickSpell(role, rng, {foeUsedAvada})`.
   - Avada Kedavra only by the Master and only against a foe who used Avada on this site's wizards. *(author decision)*
7. Otherwise `wait`, facing the foe.

**Reacting to incoming charges.** `WizardLife.update` (host) does this for each flying bolt with `tk === 'v'` that targets a wizard and has not been seen yet:
- After `W.reactT`, it calls `react({role, mana, shieldReady, domeReady, spell, eta}, rng)`:
  - `'counter'`: cast a duel charge back at `bolt.by`. Duel's generalised `_detectClashes` pairs the two bolts and a real clash begins.
  - `'shield'`: Protection, `v.shield = {until: now + 2.5 s, yaw: towards caster}`, `FX.SHIELD`, blue disc in front of the left hand.
  - `'dome'`: Master only.
  - `null`.
- The probability is `W.react` (student 35%, teacher 60%, Master 90%).

**Damage** (in `CastleLife.hit`, before the armour code: `if (v.wizard) { dmg = this.wizards.absorb(v, dmg, dir, opts); if (dmg <= 0) return; }`):
- The **dome** stops everything, blows included: the sword clangs off with sparks. Each block costs one dome hit.
- A **shield** stops magic from the front cone.
- **Ward** works like knight armour but only against magic (`opts.spell || opts.magic`): it takes the blow at 20%.
- Bare blows and swords go straight to HP. Wizards are weak in melee, which is why the Master has wind, dome and blink.
- `applyToCreature` for wizards: Stupefy stun = `15 · stunK` (Master 6 s); Ice `8 · stunK`.
- **Avada on the Master while his ward is above 0:** the ward drops to 0 with a big flash and he survives once («Мастера не убить одним словом»).
- Leviosa on the Master: he breaks free after 2 s (host calls `g.levitation.letGo('v', v, true)` and he says «Протего!»).
- Out of a fight: the Master heals 0.25 HP/s; all wizards' mana and ward regenerate.

**The Master falls** (`CastleLife._die` → `WizardLife.masterFell`):
- `state.kingDead = true` (same field, so the save format does not change);
- vault and study chests unlock;
- students run;
- teachers fight 30 s more, then say «Мы сдаёмся!» and stop unless attacked again;
- **no capture** (no new "Master" player) unless the author wants it.

---

## 6. Wandering wizards

- **Identity:** `TowerIndex.wanderDef(gx, gz)` gives a deterministic pseudo-site per 700 m cell: `{ id: 'ww'+gx+'_'+gz, kind: 'wander', population: 3, knights: 0, stalls: [], houses: [], chests: [], nodes: [], edges: [], pens: [], fields: [], zone: 0, x, z, color: 0x7a6a55, name: 'Дороги' }`.
  - Villager ids are `ww3_-1:2`. Guests rebuild them through `SiteIndex.byId`.
  - Killed ones stay dead: `state(id).killed` is already saved inside `castles`.
- **Spawning** (host, `WizardLife.update` every 20 s):
  - only if no wanderer is active within 300 m of any player and the player is outside all site lands;
  - chance per check 0.12 by day, 0.05 at night (about one per 3 minutes of exploring);
  - placed 70–110 m from a random player on dry, gentle ground;
  - the roster index is the first one not killed (0..2) in that cell.
- **Travel** (job `travel`):
  - destination: the nearest castle gate or tower door 300–1200 m away, roughly ahead, or else a far random point;
  - movement: `_steer` towards waypoints every 20 m; probe `heightAt.water` 6 m ahead and turn ±40° until dry; `_ground` and `_tryClimb` already handle ledges;
  - walks at `WALK×0.9`, rests 20–40 s now and then, Lumos at night;
  - despawns (not killed) beyond 220 m from every player.
- **Meeting the player:**
  - greets within 12 m; talks with role `wanderer` (travels, rumours, `nearestTower` direction and distance);
  - «проводи меня до башни» → `guideFor = player`; he walks to the tower and waits when the player falls more than 25 m behind;
  - trade: offers one scroll (`rollShopScroll` priced like the shop +10%), held out in `offer` mode as described in §5.
- **Defence:** same as a teacher. Hostility is personal: he gives up after 60 s or when the foe is more than 50 m away.
- **Minimap:** a violet dot labelled 🧙 when inside the map window.

---

## 7. Changes to `src/game/Duel.js` (NPC casters)

```js
const CASTER_KINDS = new Set(['p', 'v']);
_npc(id) { const v = this.game.castleLife?.byId.get(id); return v && v.wizard && !v.dead ? v : null; }

/** (host) A wizard NPC casts a duel charge from its wand at a player / creature. */
castNpc(v, spell, target /* {kind:'p'|'z'|'a'|'v', id} */) {
    const o = v.model.getWandTip(new THREE.Vector3());
    const tp = this._targetPos({ tk: target.kind, tid: target.id }, new THREE.Vector3());
    if (!tp) return null;
    const b = this._addBolt({ id: `${v.id}:${nextId++}`, by: v.id, npc: true, spell, side: 'right', tk: target.kind, tid: target.id, o, d: tp.sub(o).normalize() });
    this.game.sync?.duelCast(b);                                   // guests: 'duel' handler already accepts any `by`
    this.game.voiceGate?.noteRemote(spell, performance.now());     // its voice from my speakers is not my spell
    v.model.castNow = true; this._burst(o, this.colors(spell, v.id).glow, 14);
    return b;
}
_handOf(by, side, outPos, outDir) {          // + after the me / remote branches:
    const v = this._npc(by);
    if (v) { v.model.getWandTip(outPos); outDir.copy(v.aimDir || _fwd.set(-Math.sin(v.yaw), 0, -Math.cos(v.yaw))); return true; }
    return false;
}
_playerPos(id, out)  { /* + npc: out.set(v.x, v.y + 2.4, v.z) */ }
_strength(id, luck)  { /* + npc: this.game.castleLife.wizards.duelStrength(v, luck) */ }
_contact(id, b, op)  { /* + npc: { ok: !(v.stunT > 0) && !v.lev && v.duelHold !== false, jerk: !!v.duelGiveUp } */ }
// _detectClashes: `if (a.state === 'clash' || !CASTER_KINDS.has(a.tk)) continue;` (same for b)
// _arriveAtMe:     `if (o.by === this.me && CASTER_KINDS.has(o.tk) && o.tid === b.by && o.state === 'flying') return;`
// _arriveAtCreature: `if (c?.wizard && this.game.castleLife.wizards.blocksBolt(c, b)) { this._end(b, 'blocked'); return; }`
// applyToCreature: wizards use stunK; Avada on a warded Master breaks the ward instead (see §5)
```

- **`Levitation.holdPoint`:** skip the remote-freshness check when `g.castleLife?.byId.get(by)?.wizard`.
- **`Game.handPose(casterId)`:** add an NPC branch.
- With these, an NPC LevitateDuel lifts the player towards the NPC's wand automatically. The Master can carry an attacker out of the door by aiming at the gate, then lower them gently through `sync.lev('p', id, side, hold, false, true, v.id)`.

---

## 8. Network (host authority, no new message types)

- **`vil`:** the tuple grows by 2 fields, `[..., speed, fx, ward]` (indices 10–11). Old guests ignore them.
  - Guests run WizardFx from the `fx` bits.
  - `FX.BLINK` means: snap the position instead of interpolating it, and draw the smoke.
- **`duel` / `dend` / `clash` / `clashend`** carry NPC bolts (`by` = NPC id).
  - The host is the referee (`_contact` for NPCs on the host).
  - A guest decides hits on itself in `_arriveAtMe` (shield check), as now.
- **`spell` and `lev` get an optional `by`:** `spell(name, o, d, side, by = this.me)` and `lev(k, id, side, hold, on, gentle, by = this.me)` (NPC Wind, NPC Leviosa release). The handlers already use `m.by`.
- **`valarm`** gets `kind` for the right message.
- **`vhit`, `vsay`, `vtalk`, `vcrime`, `cst`, `tsell`** work unchanged; guests' hits on wizards go through `vhit`, then the host's `absorb`.
- **On every computer:** tower parts (deterministic), Houses (panes, beds, doors), WizardFx and beacon. **On the host only:** people, AI, bolts, restock, wanderers.

## 9. Saves

No format change:
- the tower and wanderer `state` (Master dead, killed) go into `castles` snapshot keys `wt…` / `ww…`;
- opened chests are in `chests`;
- broken panes and beds are in `houses` / `beds`;
- the shop is not saved (it restocks).

Old worlds: towers will appear on land that was empty before; saved block edits are applied on top. `MAX_LAYER` with the pinned cap leaves all old terrain identical. *Author decision:* show towers in old worlds too (proposed), or only in new ones.

## 10. Minimap, Codex, README

- **`Hud.drawMinimap(..., marks)`:** the label becomes `(c.icon || '🏰') + ' ' + c.name.replace(/^(Замок|Крепость|Академия) /, '')`, and the edge arrow shows the same icon. `this.minimapCastles` keeps collecting every name (tests use it). Wanderers appear as violet dots.
- **Do not touch the lake drawing** (CLAUDE.md).
- **`Codex.js` ITEMS** gets 4 cards:
  - «🧙 Башня волшебников» (what is there, how rare, 🧙 on the map);
  - «🧙 Волшебники и Мастер» (they defend themselves with duel spells; block with Protection or answer with your own spell; the Master is twice as strong, has a dome, wind and blink; the vault opens when he falls);
  - «📜 Лавка свитков» (take, price, «да»; the price table);
  - «🧙 Волшебники-странники».
  
  The «Свиток» card adds «…или купить в Лавке свитков».
- **README:** a section «## Башня волшебников» after «## Замки», in the same style.

---

## 11. Phased plan

**Phase 0: engine headroom** (small and on its own; review first)
- `Terrain.js`:
  - `MAX_LAYER = 56`; `const MOUNTAIN_TOP = 36` replaces `MAX_LAYER - 4` in `createHeightField`;
  - BLOCK 49–56 with `BASE_COLORS` and `PATTERN_OF`; `PATTERN.CRYSTAL = 12`, `RUNES = 13`;
  - the `k === 2` sector branch in `_buildCastles`.
- `VoxelShading.js`: patterns 12 and 13 plus their emissive light.
- `Castles.js`: `export` `Plan`, `buildHouse`, `rotLot`, `hash01`, `BLEND`; add `Plan.sector()`.
- Tests:
  - `terrain.test.js`: heights at 200 sampled far columns are the same as before (the max is still ≤ 36);
  - new `sector` test: voxels of a quarter ring, under every `rot`.

**Phase 1: placement and generation**
- New `src/world/WizardTowers.js`: `TowerIndex`, `buildTowerSite`, `buildGrounds`, `buildTower` (levels, spiral, rooms, `furnishTower`, windows, roof, entrance, graph), `buildWizardHouses`, `decorateWizardHouse`, name lists.
- New `src/world/Sites.js`.
- `TerrainData.generate` / `_buildCastles` / `_plantTrees` use `sites`; switch callers: `Houses.index`, `Animals.js:211`, `Game.js:624`.
- Test: new `tests/unit/wizard-towers.test.js` (§12).

**Phase 2: wizard people**
- New `WizardAI.js` (roster, stats, pure decisions), `WizardLife.js` (wake, crowd, jobs, practice, Lumos), `WizardFx.js`.
- `VillagerModel.js` roles, hats, robes, wand, modes, `getWandTip`, `setAim`.
- `CastleLife.js` hooks:
  - `this.wizards = new WizardLife(this)`;
  - `_roster(def, idx)` dispatcher, used in `_activate` and `_homesOf`;
  - `_wake`, `_crowd`, `_think` (`if (v.wizard && this.wizards.think(v, dt)) return;`);
  - `_say` (colour + `noteRemote`), `_updateBar` (blue ward bar);
  - `_lockHint` («Сундуки академии откроются, когда падёт Мастер»);
  - `_netSend` / `applyNet` with the extra fields; `_runtimeById` → `index.byId`.
- `Items.lootChest` / `ItemTypes.rollWizardHouseLoot`; `Game.openChest` coins: vault 60–300, wizard house 10–60.
- Minimap through `sites.nearestForMap`.
- Tests: `villager-model.test.js` (wizard roles), `wizard-ai.test.js` (roster, stats).

**Phase 3: talk and trade**
- `VillagerBrain.js`: roles, `P.wizard`, ruler words, intents, teach-a-spell, persona.
- `CastleTalk.js`: scroll goods, `seller` merchant, NPC-held goods, `guide:shop` / `guide:master`, wanderer context.
- `ItemTypes.js`: `scrollShopPrice`, `rollShopScroll`.
- `Speech.js` voices.
- Tests: `villager-brain.test.js` (wizard cases), `scroll-shop.test.js`.

**Phase 4: self-defence**
- `Duel.js` NPC casters (§7).
- `Levitation.js` `holdPoint` NPC branch + the Master breaking free.
- `Game.handPose` NPC branch.
- `WizardLife`: `offence`, `fight`, `absorb`, `blocksBolt`, bolt reactions, dome, shield, wind, blink, `masterFell`.
- `CastleLife.hit` / `_offence` / `damaged` / `theft` dispatch.
- `NetSync`: `spell` / `lev` `by` override, `valarm` kind.
- Tests: `duel-npc.test.js`, `wizard-ai.test.js` decisions; e2e attack part.

**Phase 5: wandering wizards**
- `TowerIndex.wanderDef`; `WizardLife` spawn, travel, despawn, guide; NPC-held scroll trade; minimap dots.

**Phase 6: multiplayer and saves check**
- `multiplayer.test.mjs` addition: the guest sees a host wizard's practice `fx` and an NPC bolt aimed at the guest; the guest's hit on a wizard goes through `vhit`; the Master's death is sent with `cst`.

**Phase 7: Codex, README, performance pass**
- Codex cards, README section.
- Checks: at most 14 active wizards near a player, 1 bolt in flight per NPC, at most 3 NPCs casting at one foe (reuse `_assignSlots`), WizardFx only within 40 m.

---

## 12. Tests

### Unit

**`tests/unit/wizard-towers.test.js`**
- *Deterministic:* two `TerrainData(seed 4242)` give the same `towers.cellOf` ids, x, z, parts length, names and node counts. In 9×9 cells there are ≥ 3 towers.
- *Rarer:* towers per km² < 0.5 × castles per km² over the same square.
- *Never overlapping:* for every tower, `castles.near(t.x, t.z, t.zone + BLEND)` is empty, and `castles.landAt` is null on a 4 m grid over the tower's land. Towers are more than 300 m from spawn.
- *Architecture:*
  - 7 levels; rooms include `vault`, `hall`, `shop`, `library`, `classroom`, `alchemy`, `dorm`, `study`, `observatory` (≥ 14 rooms);
  - door column air at F+1…F+5;
  - top floor reached; `max L ≤ MAX_LAYER`;
  - `topLayer(door) == F`;
  - an `ARCANE_LAMP` exists;
  - no leaves in the zone.
- *Walkable* (copy of the castles test): every node is standable; every same-level edge is walkable in 0.5 m steps; stair edges rise exactly 1 layer; everything is reachable from `towerGate`; `stall` and `room:study` are reachable.
- *Houses:* 4–6 cottages plus the tower record; each cottage has a `doorRec`, ≥ 1 chest, `wizard: true`, `bedSpots`; the tower record has 6 bed spots; `fields.length === 0 && pens.length === 0`.
- *Chunk split:* the union of `partsForChunk` over the covering chunks equals `parts`.

**`tests/unit/wizard-ai.test.js`**
- `WIZ.master.hp === 2 * WIZ.teacher.hp`, `skill === 2 ×`, `cast === ½ ×`, `stunK < teacher`.
- `duelStrength('master', full) − 0.35 === 2 × (duelStrength('teacher', full) − 0.35)`.
- `pickSpell` with a seeded rng: a student never picks Ice, Leviosa or Avada; the Master picks Avada only with `foeUsedAvada`.
- `decide`:
  - a student at 25% HP → `flee`;
  - the Master with 2 incoming and the dome ready → `dome`;
  - foe at 3 m → `wind`;
  - foe stunned and not hurt for 6 s → `hold`;
  - out of range → `move`;
  - ready and in sight → `cast`.
- `react`: with rng < react → `counter` when mana ≥ cost, else `shield`.
- `wizardRoster` is deterministic; idx 0 is the master; `stalls.length` sellers.

**`tests/unit/duel-npc.test.js`** (Duel via `Object.create(Duel.prototype)` with a stub game, like `duel-turn.test.js`)
- `castNpc` origin = the model's wand tip.
- A player bolt `tk:'v'` and an NPC bolt `tk:'p'` aimed at each other → `_detectClashes` starts a clash.
- `_strength(npc)` uses `wizards.duelStrength`.
- A shield facing the caster → `_arriveAtCreature` ends the bolt `'blocked'`.
- The dome absorbs 3 bolts, then breaks.

**`tests/unit/scroll-shop.test.js`**
- For every scroll kind, `scrollShopPrice > itemValue`.
- `rollShopScroll` is deterministic for a seed; shares are within ±5% over 10k rolls.

**`tests/unit/villager-brain.test.js`** (additions)
- A seller answers «сколько стоит свиток» with a price.
- A teacher answers «научи Protection» with text containing Codex's `say`.
- A wanderer with `ctx.nearestTower` says the direction word and the distance.
- Wizard witness lines contain «Мастер», never «Стража».

**`tests/unit/villager-model.test.js`** (changes)
- The height cap is per role (wizard ≤ 4.4).
- Wizard roles: hat ≠ none, `tool === 'wand'`, `getWandTip` above the hand, ≤ 16 meshes.

### e2e: `tests/e2e/wizards.test.mjs`

Uses `startServer` / `launch` / `openPage` / `startFromMenu('freeworld')`, as in `castles.test.mjs`.

```js
test('wizard tower: near the start, walk in, buy a scroll, a wizard answers an attack with a spell, the Master has double HP', async () => {
    // 1. find the nearest tower; daytime; stand at the gate
    const info = await page.evaluate(() => {
        const g = window.__zns.game; g.dayStart = Date.now(); g.world.setDayPhase(g.dayPhase());
        const t = g.world.terrain.data.towers.near(0, 0, 4000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__tower = t; g.character.group.position.set(t.door.x, t.door.y + 2.2, t.door.z); g.world.terrain.flushAround(t.door.x, t.door.z);
        return { dist: Math.hypot(t.x, t.z), name: t.name };
    });
    assert.ok(info.dist < 3000);
    await frames(page, 40);
    assert.ok(await page.evaluate(() => window.__zns.game.hud.minimapCastles.includes(window.__tower.name)), '🧙 on the minimap');
    // 2. walk in: along the graph gate → in → the counter, 0.5 m at a time; collision never holds me back
    const walk = await page.evaluate(async () => { /* path = graph A* towerGate→stall; for each 0.5 m: set x,z (keep y), await 2 frames,
        record max distance between wanted and actual; return { stuck, inside: hypot(p - tower) < 15, indoor: g._indoorK } */ });
    assert.ok(walk.stuck < 0.6 && walk.inside, JSON.stringify(walk));
    // 3. buy: goods on the counter → take one by hand → price → «да»
    //    (same as castles e2e: T.stalls.get(tower.id + ':s0').goods, g.items.pickUp, T.hear('да'))
    //    assert: item.kind === 'scroll', no .shop, coins −= price, price > itemValue(item)
    // 4. attack the seller (fist): he turns on me and a REAL duel charge flies at me within ~4 s
    const hit = await page.evaluate(() => { const g = window.__zns.game, L = g.castleLife;
        const s = [...L.byId.values()].find((v) => v.role === 'seller'); window.__s = s; s.damageCooldown = 0;
        g.onLocalHit(s, 2, null, true); return { foe: s.foe === g.localId, hostile: s.cs.hostile.has(g.localId) }; });
    assert.ok(hit.foe && hit.hostile);
    let bolt = null;
    for (let i = 0; i < 40 && !bolt; i++) { await frames(page, 5); bolt = await page.evaluate(() => {
        const g = window.__zns.game; const b = [...g.duel.bolts.values()].find((x) => x.npc && x.tk === 'p' && x.tid === g.localId);
        return b ? { spell: b.spell, by: b.by } : null; }); }
    assert.ok(bolt && ['Stupefy', 'SapiraDuel', 'IceDuel', 'LevitateDuel'].includes(bolt.spell), 'he casts back');
    // it arrives: hitMe or blocked in g.duel.log (both mean a real bolt reached me)
    // 5. answer a charge with my own → a clash with an NPC side starts
    //    g.duel.cast('Stupefy', { side: 'right', t: { kind: 'v', id: window.__s.id } }) while his bolt flies → g.duel.clashes.length >= 1
    // 6. the Master: double HP, the dome absorbs
    const m = await page.evaluate(() => { const L = window.__zns.game.castleLife; const all = [...L.byId.values()];
        const master = all.find((v) => v.role === 'master'), t = all.find((v) => v.role === 'teacher' || v.role === 'seller');
        L.wizards.raiseDome(master); return { hp: master.hp, maxHp: master.maxHp, avg: t.maxHp, dome: master.dome?.hp }; });
    assert.equal(m.maxHp, 2 * m.avg); assert.equal(m.hp, m.maxHp); assert.equal(m.dome, 3);
    // a Sapira at him is 'blocked' and the dome loses one hit
    assert.deepEqual(realErrors(errors), []);
});
```

`multiplayer.test.mjs` addition (Phase 6): the host and a guest stand near a tower.
- The guest's `castleLife.byId` has the wizards with hats.
- The host forces `practice LEV` on a student → the guest has a prop from WizardFx.
- The host's wizard `castNpc` at the guest → the guest's `duel.bolts` has it and `_handOf` resolves the NPC's wand tip.

---

## 13. Open questions for the author (to ask in Russian, simply)

1. Можно ли поднять потолок мира, чтобы башня была высокой, с остроконечной крышей? Горы не изменятся. Если нельзя, будет 6 этажей с плоской крышей-обсерваторией.
2. Когда Мастер побеждён: только открываются сундуки хранилища, или игрок сам становится Мастером, как с королём?
3. Может ли Мастер отвечать «Авадой» тому, кто сам применил её к волшебникам? И продавать ли свиток Авады (задача #121) только у Мастера, за 500 монет?
4. Нужен ли светящийся луч над башней, чтобы её было видно издалека ночью?
5. Появляться ли башням и в уже сохранённых мирах?

---

Scratch files (nothing in the repo was changed):
- `/tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/wt/sim.mjs` (tower placement density and F values, using the real generator)
- `/tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/wt/castF.mjs` (castle F values)
- `/tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/wt/towerproto.mjs` (voxelised drum, spiral stairs, slab holes, railings and walking graph, checked the castle-test way; run `node towerproto.mjs 2.6 20`)