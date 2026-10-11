# Wizard Tower, wizard houses and wandering wizards: reviewed design and phased plan

I checked the design against the code and ran measurements in scratch (read-only imports of the repo; nothing in the repo was changed). The original design does not work as written in several places. The biggest problems:

- **Tower placement as designed would freeze the game.** Checking a 1200 m tower cell against castles forces about 30 full castle plans to be built (1–2 ms each, measured) during chunk streaming, which has a 4 ms budget. The fix is to put towers on the castle grid (section 3).
- **NPC spell words would cast spells from the player's hand in single-player.** `voiceGate.check` only runs when `game.remotes.size > 0` (`src/main.js:374`), so `noteRemote` alone does nothing in single-player.
- **A wizard who loses a beam duel takes no effect.** `_finishClash` only applies the result to `this.me`.
- **The Master's Wind would hurt himself and make the tower attack the host.** `birdRay` (`Game.js:178`) sends all ray damage to villagers with `this.localId`, and `Wind` is in `RAY_SPELLS` (4 damage, the caster included).
- **The cast pose points the wand straight up.** With `aRX = 1.45` and `wrist = −1.45`, the tool direction is `(0, cos(w+θ), sin(w+θ)) = (0, 1, 0)`.
- **Most tower furniture would be silently dropped.** The aisle test pads each diagonal walking leg with an axis-aligned box, and these boxes cover nearly every half-room.
- **Several code paths would crash for wizard roles:**
  - `STATS[e.role]` and `roleTitle` have no wizard entries.
  - `pick(SHOUT.ambient[role])` gets `undefined`.
  - The flee code reads a node from an empty graph for wanderers.
  - `item.shop.stall.split` fails for goods held by an NPC.

---

## 0. Summary for the author (in Russian, pass on as is)

Сделаем так:
- **Башня волшебников (Академия).** Широкая круглая каменная башня. Подвал-хранилище и 6 этажей, винтовая лестница вдоль стены. Наверху обсерватория под фиолетовой остроконечной крышей.
  - Около 14 комнат: зал, лавка свитков, библиотека, класс, лаборатория, спальня учеников, кабинет Мастера и другие. Внутри светят кристаллы.
  - Вокруг стоят 4–6 «немного волшебных» домиков. Ферм нет.
  - Башни встречаются в 3–5 раз реже замков и никогда не стоят рядом с замком.
  - Одна башня всегда есть недалеко от начала пути, примерно в 0,5–1,3 км. Её видно на мини-карте значком 🧙.
- **Волшебники.** Похожи на жителей, но в мантиях, в остроконечных шляпах и с палочкой в руке.
  - Шляпа гнётся, если упирается в потолок или в дверной проём.
  - С ними можно говорить. Наставник даже объяснит, как колдовать нужное заклинание.
  - Иногда видно, как они практикуются: поднимают книгу Левиосой (иногда неудачно), зажигают Люмос ночью, пускают искры в манекены.
- **Свитки.** В лавке на первом этаже лежат свитки. Берёшь рукой, продавец называет цену, говоришь «да». Цена зависит от силы свитка: от 70 до 380 монет.
- **Защита.** Стражи нет. Кто нападёт, тому волшебники отвечают настоящими дуэльными заклинаниями. Их можно отбить «Protection» или встретить своим заклинанием (будет дуэль).
  - Волшебники защищаются, а не добивают: упавшего или оглушённого не трогают.
  - В Творческом режиме, как и рыцари, они вреда не причиняют.
- **Мастер.** Вдвое сильнее обычного волшебника: здоровья 32 против 16, мастерства вдвое больше, колдует вдвое быстрее. Ещё у него:
  - купол Protection Maxima;
  - порыв ветра, если подойти вплотную;
  - перемещение на расстояние;
  - он быстро приходит в себя от «Остолбеней».
  
  В дуэли лучей свежий Мастер почти всегда сильнее. Его побеждают так: сначала отбить щитом его первые заклинания, пока он не устанет, а потом бить.
- **Волшебники-странники** иногда встречаются в пути. Продадут свиток, подскажут, где ближайшая башня, могут проводить. Тоже защищаются сами.
- **Мне нужно ваше решение:** чтобы башня была высокой, с остроконечной крышей, миру надо разрешить строить выше. Горы и уже сохранённые миры от этого не изменятся.

---

## 1. Corrections to the original design (summary, with evidence)

**Placement**
- **C1. Tower placement goes on the castle grid** (480 m cells, one site per cell). A castle's land never leaves its own cell: the margin is `zone+BLEND+10` (`Castles.js:1130`). So a tower in a castle-free cell needs only `castles.cellOf(gx,gz)` of its own cell, which chunk generation needs anyway.
  - Measured with `scratch/sim2.mjs` over 5 seeds and a 7.68 km square, with `TOWER_P = 0.2`: 0.25–0.39 towers/km² against castles 1.12–1.31/km², so **2.9–5.1× rarer**.
  - Cost: 0.25–0.45 ms per tower cell.
  - The original 1200 m cells measured 4.9–5.5 ms per cell plus about 30 forced castle-plan builds (1–2 ms each, `scratch/cost.mjs`).
- **C2. Spawn tower is guaranteed.** With P = 0.2, the nearest tower to spawn was 372–1380 m. A deterministic "spawn tower" in the 500–1300 m ring makes discovery and the e2e test reliable.
- **C3. Existing bug in `heightAt` (`Terrain.js:258–260`).** `raw.water` is read after `idx.landAt()`, which may generate a site and re-sample `raw`. The first wet column queried in a fresh cell gets `water = 0`: **133 of 169 cells** were wrong (`scratch/waterbug.mjs`). The result depends on what touched the cell first, so host and guest can disagree. A second index (towers) doubles how often this happens. Read `raw.water` before `landAt`.

**Engine (Phase 0)**
- **C4. `_buildCastles` uses `const cyl = p.k === 1`.** The sector part needs `p.k === 1 || p.k === 2`, plus a tight bounding box. A full-circle box per step would make every step part scan about 1000 columns.

**Houses**
- **C5. House lots must be at |u| or |v| = 42 (33 + 9), not 43.** `roadNode = lot + rotLot(0, −9)` must land exactly on the road centre line, or `joinRoads` never links the door (`Castles.js:1029`, `:118`).

**Minimap**
- **C6. Two minimap problems.**
  - `Hud.drawMinimap` draws `castles.slice(0, 2)` (`Hud.js:347`), so a third mark (the tower) is dropped.
  - `towers.near(p, 1600)` every 5 frames would generate about 100 castle cells (53–93 ms) on the first call in a new area. Use radius 900 and the same 40 m cache as `CastleIndex.nearestForMap`.

**Duels and spells**
- **C7. `Duel._finishClash` applies the result only to `this.me`.** An NPC loser gets nothing. On the referee, the winner's spell must be applied with `applyToCreature`.
- **C8. NPC bolt fizzles are never broadcast.** `_end` broadcasts only when `b.by === this.me || hit || blocked`. The host must broadcast fizzles of NPC bolts.
- **C9. Voice echo.**
  - The gate only runs in multiplayer (`main.js:374`). It must also run whenever an NPC spoke a spell word recently.
  - Every NPC line spoken aloud (`CastleTalk.voice`), not only practice lines, must note its spell word, timed to the end of the speech.
- **C10. Teaching through the spells path.** `main.js:385` sends a sentence to villagers only when `matchSpell` found nothing. «научи Protection» would never reach the teacher. Add a routing rule.
- **C11. Ray damage is attributed to the wrong player.** `birdRay` sends all ray damage to villagers with the host's id, Wind included, and the caster's own body is inside the ray. Pass `casterId`, give Wind no creature damage, and skip the caster.
- **C12. The cast pose.** For the wand to continue the forearm, `wrist = −π/2 − aRX`. The bolt direction must come from the wand's own base→tip on every computer. Only `aimPitch` is synced.

**Tower interior**
- **C13. Furniture against walking legs.** `furnish()` drops any box within the axis-aligned bounding box (±1) of a walking leg (`Castles.js:224–227`). Diagonal radial legs would delete nearly all tower furniture. Use a segment-distance test and fewer radial links. A unit test must assert that the key furniture exists.
- **C14. Bed spots are not blocks.** The furniture filter never sees them. They must also be kept off the aisles. Capacity: 4 beds in the F4 back half and 2 in the front half, laid out in §5.
- **C15. Hats and ceilings.** Doors, stairs and floors give 5–6 m of headroom; a villager is 4.65 m tall. The hat is limited to about 0.95 m and tilts back under a low ceiling (a separate mesh, physical). Wizard cottages get 6 m doors.

**Crash risks and missing hooks**
- **C16. Crash risks:**
  - `STATS[e.role]` (`CastleLife.js:228`);
  - `roleTitle` (`:103`);
  - `pick(SHOUT.ambient[v.role])` (`:1264`);
  - the flee branch reads `g2.nodes[...]` with no nodes (`:616`);
  - `item.shop.stall.split` in `tookGood` and `_unpaid` (`CastleTalk.js:242`, `:358`);
  - existing brain tests loop over all `ROLES` and need ≥ 15 distinct small-talk lines per role (`villager-brain.test.js:102`).
- **C17. Missing dispatch points:**
  - `_wake`, `_crowd`, `_think` (exact placement), `_nextTrip`, `_offence`, `damaged`, `theft`, `_die`, `_lockHint`, `_announceCapture` / `applyState` (wrong «захватил» text), `_runtimeById`;
  - wander runtimes must stay `awake: false` (otherwise `_scan` puts them to sleep, `:278–282`).
- **C18. The host cannot see a guest's stun or a lift by an NPC.** `Combat.serialize` has no stun (`Combat.js:555`), and `onNetLift` ignores NPC ids. The mercy rule needs both. `Game.playerName` returns `null` for NPC ids.
- **C19. Guests' spell hits arrive as `mg=0`.** `hit()` sends only `opts.magic` (`CastleLife.js:910`), so the host cannot tell magic hits from melee for the ward and the shield. Use bit flags.

**Smaller fixes**
- **C20. NPC-held goods.** Hovering loose items are never position-synced (`Items.js:563` sends only `!L.hover`). An offered scroll must hover at a fixed point while the NPC stands still.
- **C21. Other details:**
  - **Dorm:** «students sleep in beds» is not possible (#109 is pending); they stand in the dorm.
  - **Codex import:** `Codex.SPELLS` can be imported (no DOM at module top). The spell asked about must be passed from `CastleTalk` (`matchSpell` lives in a three.js module) to keep `VillagerBrain` pure.
  - **Wanderer queries:** destination and `nearestTower` must use already-generated cells only.
  - **Hat mesh count:** the hat moves to its own mesh; the wanderer carries a staff in the right hand (no left-hand slot needed).
  - **Golden tests:** must compare raw heights and castle definitions (towers do change `heightAt`).
  - **CLAUDE.md rule:** e2e tests must use synthetic poses for the player's own actions.

Golden digests of the **current** generator, computed now (`scratch/golden.mjs`), for the Phase 0 test:

| seed | rawDigest (400 columns, h:water) | rawMax | castleDigest (cells −3..3²) |
|---|---|---|---|
| 1 | `f534e2fc` | 36 | `93c43a92` |
| 4242 | `96ea22ec` | 36 | `409e12b0` |
| 12345 | `71f5a05` | 36 | `11c39bd8` |

`rawMax = 36` confirms that `MAX_LAYER − 4` is the binding mountain cap. It must be pinned at 36.

---

## 2. Constraints (verified)

1. **The height limit.**
   - `MAX_LAYER = 40` (`Terrain.js:142`) and `HEIGHT = MAX_LAYER − MIN_LAYER + 1 = 50`.
   - `_walkable` needs 5 free layers above the floor (`CastleLife.js:545–553`).
   - Every castle checked is at `F = 0` (13 of 13 and 17 of 17, `scratch/cost.mjs`). Tower sites have a median height of 0 (one site had 1).
   - With `F = 0`, layer `L = l + 1`.
   - The tower needs `l` from −8 to 55, so **`MAX_LAYER = 56`**.
   - The mountain cap must be pinned: `const MOUNTAIN_TOP = 36` replaces `MAX_LAYER - 4` at `Terrain.js:184`.
   - Memory: 16 KB more per chunk. `evictFar` keeps up to (2·(R+4)+1)² = 289 chunks, so about +4.7 MB.
   - `MAX_LAYER` is used only in `Terrain.js` and tests. Nothing else hard-codes 40. The shadow camera reaches 500.
   - Fallback if the author refuses: 6 levels `[−7, 0, 7, 14, 21, 28]` with a flat parapet observatory, top at L 38.
2. **Duel charges come only from players today.**
   - Player-only code: `_handOf`, `_playerPos`, `_strength`, `_contact`, `_detectClashes` (`tk !== 'p'`), `_arriveAtMe` (`o.tk === 'p'`), `_finishClash` (only `loser === this.me`), `_end` (broadcast rule), and `Levitation.holdPoint` (stale-caster check).
   - No villager ever casts.
3. **What `CastleLife` gives for free once roles are added:**
   - Leviosa on bodies (`Levitation.js:90`), weapons and fists (`Game.js:1758`, `onLocalHit`).
   - Area and ray spell hits (`hitAt` / `hitRay`), duel targeting (`findTarget` kind `'v'`), doors, glass, beds, the save snapshot.
   - Talk, trade and roster code need the C16/C17 changes before they work.
4. **Castles.js exports needed:** `Plan`, `buildHouse`, `rotLot`, `hash01`, `BLEND`, `CASTLE_CELL` (already exported) and `furnish`.
5. **Circular import.** `Terrain.js` ↔ `Castles.js` works only because no module reads `BLOCK` at top level.
   - `WizardTowers.js` imports `Terrain.js` (BLOCK) and `Castles.js`, and must not read `BLOCK` at top level. Build style tables inside functions.
   - `Sites.js` imports nothing from `Terrain.js`.
   - `Terrain.js` must not use `TowerIndex` / `SiteIndex` at top level.
6. **Overlaps with pending tasks:**
   - #121 (Avada only from a scroll): the Master's Avada sale waits for it.
   - #123 (mana): the NPC mana here uses the same idea.
   - #124 (mana crystals): the tower crystal blocks are decorative lamps called `ARCANE_LAMP`.
   - #109 (lie on a villager's bed): dorm beds are real `Beds`, but NPCs do not lie in them.

---

## 3. Placement: `src/world/WizardTowers.js`, `src/world/Sites.js`

### Rules
```js
import { CASTLE_CELL, BLEND, hash01 } from './Castles.js';
export const TOWER_ZONE = 58;                       // half-size of the levelled land
const TOWER_P = 0.2;                                // share of castle-free cells that try
const TOWER_M = TOWER_ZONE + BLEND + 10;            // 94: tower land stays ≥ 10 m inside its 480 m cell
const TOWER_SPAN = CASTLE_CELL - 2 * TOWER_M;       // 292
const TRIES = 12;
const MIN_SPAWN = 300 + TOWER_ZONE;                 // tower centre ≥ 358 m from spawn
const SPAWN_RING = [500, 1300];                     // the guaranteed spawn tower: cell centre distance
```
- **One site per castle cell.** A cell has a tower only if `castles.cellOf(gx, gz) === null`.
- **Spacing.** Castle and tower lands both stay at least 10 m inside their cells, so their blend skirts are at least 20 m apart. No cross-cell query is ever needed.
- **Gate.** `key === spawnKey() || hash01(gx*11+3, gz*13+5, seed+1700) <= TOWER_P`.
- **Tries.** `rng = createRng((seed*31337 + gx*7919 + gz*104723) >>> 0)`. Each try picks `X = round(gx*480 + 94 + rng()*292)` and the same for Z.
  - Reject if `hypot(X, Z) < MIN_SPAWN`.
  - Reject unless `flatDryGround(raw, X, Z)` passes: on an 8 m grid over ±58, every height ≤ 9, wet samples ≤ 15 %, at least 10 dry samples, and p90 − p10 ≤ 6.
- **F = 0 always.** `buildTowerSite(seed, gx, gz, X, Z, 0, rng)` continues with the same `rng`.
- **`spawnKey()`.** Computed lazily once.
  - Cells whose centre distance lies in `SPAWN_RING`, sorted by (distance, gx, gz).
  - The first one that has no castle and where `_place` succeeds becomes the spawn tower; −1 if none.
  - This forces about 20 castle cells near spawn, which the minimap generates anyway.
- **Deterministic.** The result depends only on the seed and the castle index.

### `TowerIndex` (same shape as `CastleIndex`)
```js
export class TowerIndex {
    constructor(seed, raw, castles) { this.seed = seed; this.raw = raw; this.castles = castles; this.cells = new Map(); this._lastCell = null; this._spawn = undefined; this._wander = new Map(); }
    cellOf(gx, gz) { /* cache; _makeTower */ }
    near(x, z, r = 0)     { /* exactly CastleIndex.near's loops, CELL = CASTLE_CELL */ }
    landAt(ix, iz)        { /* CastleIndex.landAt, returns { castle: def, w } (keep the field name `castle`) */ }
    partsForChunk(cx, cz, C) { /* CastleIndex.partsForChunk (def._byChunk cache) */ }
    nearestForMap(p, r = 900) { /* the 40 m-key cache like CastleIndex; nearest 1 */ }
    knownNear(x, z, r)    { /* only cells already in this.cells: no generation (talk, wanderers) */ }
    wanderDef(gx, gz)     { /* §9 */ }
}
```

### `SiteIndex` (`src/world/Sites.js`, pure)
```js
export class SiteIndex {
    constructor(castles, towers) { this.castles = castles; this.towers = towers; }
    near(x, z, r = 0) { const a = this.castles.near(x, z, r), b = this.towers.near(x, z, r); return b.length ? a.concat(b) : a; }
    landAt(ix, iz) { return this.castles.landAt(ix, iz) || this.towers.landAt(ix, iz); }
    partsForChunk(cx, cz, C) { const a = this.castles.partsForChunk(cx, cz, C), b = this.towers.partsForChunk(cx, cz, C); return b.length ? a.concat(b) : a; }
    byId(id) { const m = /^(cs|wt|ww)(-?\d+)_(-?\d+)$/.exec(id); if (!m) return null;
        return m[1] === 'cs' ? this.castles.cellOf(+m[2], +m[3]) : m[1] === 'wt' ? this.towers.cellOf(+m[2], +m[3]) : this.towers.wanderDef(+m[2], +m[3]); }
    nearestForMap(p) { return [...this.castles.nearestForMap(p).map((c) => ({ ...c, icon: '🏰' })), ...this.towers.nearestForMap(p).map((t) => ({ ...t, icon: '🧙' }))]; }
}
```

### `TerrainData.generate` (Terrain.js:249–272)
```js
const raw = createHeightField(seed, mountains);
this.castles = this.towers = this.sites = null;
if (mountains) {
    const idx = this.castles = new CastleIndex(seed, raw);
    this.towers = new TowerIndex(seed, raw, idx);
    const sites = this.sites = new SiteIndex(idx, this.towers);
    const fn = (ix, iz) => {
        const h = raw(ix, iz), wet = raw.water;            // (C3: before landAt, which may re-sample raw)
        const land = sites.landAt(ix, iz);
        if (!land || (land.w < 1 && wet)) { fn.water = wet; return h; }
        fn.water = 0;
        const F = land.castle.F;
        return land.w >= 1 ? F : Math.round(F + (h - F) * (1 - land.w));
    };
    ...
```
- `_buildCastles` uses `this.sites.partsForChunk`.
- `_plantTrees` uses `this.sites.landAt` (both checks).
- Callers switched from `data.castles` to `data.sites`:
  - `CastleLife.index` (`:183`), `Houses.index` (`:75`);
  - `Animals.js:211`;
  - `Game.js:624` (indoor lighting, so the cellar counts as a building and not a cave);
  - `Game.js:1786` (minimap).
- `data.castles` stays as it is for old code and tests.

---

## 4. Engine pieces (Phase 0)

### Sector part: `Plan.sector(u, v, r, hr, a0, a1, l0, l1, t)`
- Local angles are counted counter-clockwise from +u towards +v: `atan2(v, u)`.
- World angle = local + `rot·π/2`. This was checked with `Plan.wx/wz`, which are proper rotations.
- Bounding box: from the arc ends and every k·π/2 crossing inside the span, at both `r` and `hr`. Then `floor(min) − 1` / `ceil(max) + 1`.
- Push `{ k: 2, cx, cz, r, hr, a0w: a0 + rot·π/2, span: a1 − a0, x0, x1, z0, z1, L0, L1, t }`.

`Terrain._buildCastles`:
```js
const ring = p.k === 1 || p.k === 2;
const r2 = ring ? p.r * p.r + p.r * 0.6 : 0, h2 = ring && p.hr >= 0 ? p.hr * p.hr + p.hr * 0.6 : -1;
... if (ring) { d2 test as now }
    if (p.k === 2) { let a = Math.atan2(z - p.cz, x - p.cx) - p.a0w; a -= Math.floor(a / TAU) * TAU; if (a >= p.span) continue; }
```
Keep step boundaries away from exact lattice angles (θ0 = 20° already does this).

### New blocks (ids 49–56; `isCastleBlock` is true, so wrecking them is a crime)

| id | name | colour | pattern |
|---|---|---|---|
| 49 | `ARCANE` | 0x56597f | ASHLAR |
| 50 | `ARCANE_DARK` | 0x3b3d5c | ASHLAR |
| 51 | `ROOF_PURPLE` | 0x5b2d8e | TILES |
| 52 | `ARCANE_LAMP` | 0x8fe3ff | CRYSTAL (12), glows |
| 53 | `ARCANE_LAMP_VIOLET` | 0xc58bff | CRYSTAL, glows |
| 54 | `CARPET_PURPLE` | 0x6a2c91 | CLOTH |
| 55 | `POTION` | 0x5dff8a | GLOW (11) |
| 56 | `RUNE` | 0x2e3150 | RUNES (13), faint glow |

- Add `PATTERN.CRYSTAL = 12` and `PATTERN.RUNES = 13`.
- The mask packing `pattern * 0x1000000` into an `Int32Array` is safe up to pattern 127.

### `VoxelShading.js`
- `pat == 12.0`: `diffuseColor.rgb *= 0.8 + 0.4*step(0.5, fract((uv.x+uv.y)*2.0));`
- `pat == 13.0`: `float ring = 1.0 - smoothstep(0.02, 0.04, abs(length(f - 0.5) - 0.32)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55,0.75,1.0), ring*0.7);`
- Emissive: `pat==11||pat==12` adds ×0.9; `pat==13` adds `diffuseColor.rgb*0.5*ring`. Recompute `ring` in the emissive chunk, or pass it through a varying.

### `Castles.js`
- Export `Plan`, `buildHouse`, `rotLot`, `hash01`, `BLEND`, `furnish`; add `Plan.sector`.
- `buildHouse(p, kind, cu, cv, face, rng, s, out)` gets optional style fields. These are **no-ops for castles**, which must keep the exact same rng call sequence:
  - `s.doorTop` (default 4): door opening `0..doorTop`, lintel at `doorTop+1`, `doorRec.h = doorTop+1`.
  - `s.noWoodpile`: written as `if (!s.noWoodpile && !rich && !T.barn && rng() < 0.6)`.
  - `s.decorate?.(P, { kind, w, d, h, rich, da, top, house })`: called just before `out.houses.push(house)`.

### Tests (Phase 0)
- `terrain.test.js`: assert the golden digests above for raw heights (`createHeightField`) and castle definitions, and that `rawMax ≤ 36`.
- New `sector` test: voxels of a quarter ring at all 4 `rot` values match the expected set (rotate the expected set).
- Water fix: for 20 fresh-cell wet columns, `heightAt.water` is equal on first and second call.

---

## 5. Tower architecture (`buildTowerSite`, `buildTower`, `buildGrounds`)

Rot-local coordinates: tower centre (0, 0), door at the front (−v).

### Shell
- **Drum:** `cyl(17, −8, 41, ARCANE)` then `cyl(15, −7, 40, AIR)`.
- **Slabs:** `cyl(15, l−1, l−1, ARCANE_DARK)` for each level except the cellar. The cellar floor is the drum base at l −8.
- **Levels:** `LEVELS = [−7, 0, 7, 14, 21, 28, 35]`; `FLOOR_H = 7` (a slab plus 6 air layers).
- **Roof:** roof slab at l 41.
  - Cone: for k = 0..13, `rr = 19·(1 − k/14)` and `cyl(rr, 41+k, 41+k, ROOF_PURPLE)` while `rr ≥ 0.4`. The cone is solid.
  - Finial: `ARCANE_LAMP_VIOLET` at l 55 (L 56 = `MAX_LAYER`).
  - Six `GOLD` stars on the cone.
- **Outside:** a string course `cyl(17.5, l−1, l−1, CS_WHITE, 16.5)` at every slab, and 4 diagonal buttresses (2×2, l −1…8).

### Spiral stair
This is verified by `scratch/towerproto.mjs 2.6 20`: 184 nodes, 0 problems, all nodes reachable. θ0 = 35° gives 2 problems.
- Band r 11.5–15. Step arc 2.6 m at r 13.25, so Δ = 11.2°. Seven steps per flight. Flight k starts at θ(k) = 20° + 9kΔ.
- For each step i:
  - headroom `sector(0,0,15,11.5, θ+iΔ, θ+(i+1)Δ, l+i+1, l+i+5, AIR)`;
  - the step itself `sector(…, l, l+i, ARCANE_DARK)`.
- On the floor above:
  - railing `sector(0,0,11.5,10.5, θ, θ+7Δ, L₊, L₊+1, FENCE)`;
  - closed start `sector(0,0,15,11.5, θ, θ+Δ, L₊, L₊+1, FENCE)`.
- **Graph node coordinates are rounded to integers**, as in the verified prototype.

### Rooms
- Every level has a divider wall along v = 0, from u −11 to 11, 6 high, with a doorway at u −1..1 (5 high).
- Each half is a room: `back` (v > 0) and `front` (v < 0).

| level | l | back half | front half |
|---|---|---|---|
| cellar | −7 | Хранилище (vault): 3 locked chests `room:'vault'`, GOLD, RUNE circle | Кладовая: crates, hay, potion shelf |
| G0 | 0 | Большой зал: 2 tables + benches, floating `ARCANE_LAMP` ring at l 5, banners | Вестибюль + Лавка свитков (counter below), RUNE circle inside the door |
| F1 | 7 | Библиотека: `BOOKS` 5 high on the divider + short radial shelves at r 4–8, tables | Читальня: lecterns, armchairs (`CARPET_PURPLE`), crystal globe |
| F2 | 14 | Класс: 3 desk rows facing a lectern, chalkboard `CS_DARK` on the divider, 2 dummies (HAY on FENCE) → `out.dummies` | Учительская |
| F3 | 21 | Лаборатория: 2 cauldrons (COBBLE ring r 1.5 + POTION) → `spots` kind `'cauldron'` | Травница: planters, hanging WHEAT |
| F4 | 28 | **Спальня учеников: 4 beds** (layout below) | **Гостиная: 2 beds** + fireplace, armchairs, chessboard |
| F5 | 35 | Кабинет Мастера: desk with gold, the Master's chair, crystal ball, shelves, 1 locked chest `room:'study'`, RUNE star chart | Обсерватория: GOLD telescope rising into a dormer cut (u −2…2, l 41…44, front) |

### Walking graph (corrected; C13)
- **Per level:** room centres `(0, ±6)` tagged `room:<kind>`, plus doorway nodes `(0, ±1)`.
- **Band nodes:** 12 nodes at r 13.25 every 30°, skipping any node or arc that touches that level's blocked sectors (as in the prototype).
- **Radial links, at most 2 per half-room**, each going band node → r 9 node → room centre. Default angles: back half 45°/135°, front half 225°/315°.
  - Exceptions: the **F4 back half** uses only 90°; **G0 front** uses 240°/300°.
  - Pick the nearest free (unblocked) angle within ±30° of the default.
- **Stairs:** `stairsBottom` at θ − 0.6Δ, then 7 `step` nodes at layers l+1…l+7, then `landing` at θ + 7.6Δ on the next level.
- **Tags:** `towerGate` (0, −22, outside), `towerIn` (0, −12), `stall` (customer front of the counter), `room:study`, `room:classroom`, `room:library`, `room:hall`, `room:dorm`, `cauldron`, `dummy`, `telescope`, `ring` (ring road), `home` (cottage insides + the dorm).

### Furniture: `furnishTower(p, room, s, out, legs)`
- Same box helper as `furnish`, but the aisle test is the **distance from the box footprint to each leg segment < 1.0 m**, not the leg's bounding box.
- Nothing is placed in the band (r > 10.5), except wall lamps set into the wall.
- `bedSpots` and chests must pass the same test using their footprints: a bed is 2.5 × 5.5, a chest 1.2 × 1.0.

### Fixed spots (starting coordinates; the unit test decides)
- **Scroll counter (G0 front).**
  - `PLANKS_DARK` u −9..−8, v −5..−1, l 0..1.
  - Seller (`back`) at (−10.5, −3); customer (`front`, `frontNode` tagged `stall`) at (−6, −3).
  - Record: `{ front, back, frontNode, counter: { ...p.rect(-9,-8,-5,-1), top: p.L(1) - 0.5 }, yaw: p.yaw(-π/2) }`, the same shape as market stalls.
- **Dorm (F4 back).** 4 beds with the pillow at the divider: `bedSpots = [-7,-4,4,7].map(u => ({ ...p.pt(u, 3.35, 28), yaw: p.yaw(0) }))`.
- **Common room (F4 front).** 2 beds: `u = ±7`, `v = −3.35`, `yaw: p.yaw(π)`.
- **Master's chair.** A `PLANKS_DARK` block at (0, 7, l 35) with a back 3 high. `def.throne = { ...p.pt(0, 7, 36), yaw: p.yaw(0) }`; `throneFront = p.pt(0, 3, 35)`.

### Windows and lamps
- Windows are 2 wide × 4 high (l+2…l+5) through the 2-thick wall, recorded exactly like `buildHouse`'s `win()`. They are placed at the angles 0°, 90°, 180°, and 270° (not on G0, where the door is).
- **A window is skipped if its ±15° overlaps a flight sector at that level** (the flight going up or the one arriving). F5 gets 8 windows by the same rule.
- `ARCANE_LAMP` blocks are set in the wall every ~6 m at l+4.

### Entrance and grounds
- Door u −2…2, l 0…5, through the wall at the front.
- `ARCANE_DARK` pillars at u ±3 (l 0…7) with a lamp keystone; lamp pillars at (±5, −20).
- Plaza: disc r 26 in COBBLE at l −1, a `RUNE` ring at r 21–22, 4 obelisks at r 23 on the diagonals.
- Square ring road at |u| or |v| = 33, 3 wide `PATH`, using `roadLine` + `joinRoads`.
- Entrance road from v −58 to the plaza, with lamp posts every 10 m; gate arch at v −52.

### Site record (castle-shaped)
```js
{ id: `wt${gx}_${gz}`, kind: 'tower', gx, gz, x: X, z: Z, F: 0, rot, name, king: master, master,
  color: 0x6a2c91, colorName: 'фиолетовые', stone: BLOCK.ARCANE, zone: TOWER_ZONE,
  walls: p.rect(-19, 19, -19, 19), inner: p.rect(-15, 15, -15, 15), door: p.pt(0, -22), doorIn: p.pt(0, -12),
  population, knights: 0, teachers,                                    // 24–48, 3–5
  throne, throneFront, posts /* 2 at the door, yaw outward */, rooms, chests /* `${id}_ch${i}` */,
  houses /* cottages `${id}_h${i}`, then the tower pseudo-house */, stalls: [counter], fields: [], pens: [], market: null, wallWalk: [],
  dummies, spots, nodes, edges, parts, _byChunk: new Map() }
```
- **Tower pseudo-house** (last in `houses`): `{ kind: 'tower', rich: true, wizard: true, id, c: p.pt(0,0), r: 18, doorRec: null, windows, chests: [], bedSpots: all 6, homeNode: dormCentreNode, door: p.pt(0,-22), inside: p.pt(0, 6, 28), beds: 6, bedColour: 'purple' }`.
  - Houses.js then adds glass and beds with no change.
  - `spawnFamily` puts 2 students *standing* in the dorm.
- **Names.** Tower: «Академия «{A} {B}»» with A from `['Звёздный','Лунный','Туманный','Сапфировый','Аметистовый','Северный','Хрустальный','Сумеречный','Небесный','Старый']` and B from `['Шпиль','Купол','Свиток','Посох','Пик']`. Master: `['Элдрин','Корвин','Северин','Аурелий','Мирабель','Ингвар','Октавиан','Велимира','Радомир','Мелисандра']` + `['Седобородый','Звездочёт','Мудрый','Огненный','Тихий','Всевидящий','Лунный']`.

---

## 6. Wizard houses (`buildWizardHouses`)

- **Lots (C5):** u = −42 with face 1 (v −10 and +12); u = +42 with face 3; v = +42 with face 0 (u −12 and +12). The rng picks 4–6 of these.
- **Kinds:** `['cottage','manor','towerhouse','cottage','stone']` (no barn).
- **Style:**
  ```js
  wizStyle = { houseStone: ARCANE, villageRoof: ROOF_PURPLE, poorRoof: rng() < 0.35 ? ROOF_BLUE : ROOF_PURPLE, poorWall: PLASTER, roof: ROOF_PURPLE, carpet: CARPET_PURPLE, bedRich: 'purple', doorTop: 5, noWoodpile: true, decorate }
  ```
- **`decorate(P, info)`**, in lot-local coordinates, knowing the layout:
  - hearth at (−w+1, 1) for rich houses or (−w+1, 0) for poor;
  - cauldron one cell inside the hearth;
  - crystal ball (`ARCANE_LAMP`) on the table, at (−3, 2) rich or (−w+3, 1) poor, at l 2;
  - herb planter (`FLOWERS` on `PLANKS`) under the front window;
  - violet lamp on the ridge, blue lamp beside the door.
  
  Then `house.wizard = true`. Nothing may be placed on the inside path `(da, −d−3) → (da, −1) → (1, −1) → (3, −2)`.
- **Loot.** `Items.lootChest` checks `house?.def?.kind === 'tower'` and calls `rollWizardHouseLoot(rng, rich)` (in ItemTypes, pure). Houses.js needs no change.
  - 1–3 items: scroll `hp`/`fatigue` 55 %; `spell` scroll 9 % (ToTheSun 45 %, Thunderwave 35 %, LightningStrike 20 %); `flight` 3 %; spell book 10 %; plain wand 5 %; otherwise food.
  - **The spell book** is built in `Items.lootChest`: `{ kind: 'book', uid: newUid(), id: 100000 + floor(rng()*1e6), spells: bookSpells(id) }`, with `bookSpells` imported from BookBirds.js.
  - Coins stay the existing house coins.
- **Theft.** `Houses.chestOpened` → `CastleLife.theft`, which dispatches to `WizardLife.theft` (§8).

---

## 7. Wizard people

### Roster and stats (`src/game/WizardAI.js`, pure, node-testable)
```js
export const WIZARD_ROLES = ['student', 'teacher', 'seller', 'master', 'wanderer'];
export const WIZ = {
  student: { hp: 12, ward: 0,  mana: 30, regen: 1.0, skill: 0.8, cast: 3.2, react: 0.35, reactT: 0.7,  stunK: 1.0, range: [7, 14],  spells: { Stupefy: 0.5, SapiraDuel: 0.5 } },
  teacher: { hp: 16, ward: 10, mana: 40, regen: 1.5, skill: 1.0, cast: 2.2, react: 0.6,  reactT: 0.45, stunK: 0.7, range: [8, 16],  spells: { Stupefy: 0.3, SapiraDuel: 0.35, IceDuel: 0.2, LevitateDuel: 0.15 } },
  master:  { hp: 32, ward: 20, mana: 80, regen: 3.0, skill: 2.0, cast: 1.1, react: 0.9,  reactT: 0.25, stunK: 0.4, range: [10, 20], spells: { Stupefy: 0.25, SapiraDuel: 0.4, IceDuel: 0.2, LevitateDuel: 0.15 },
             dome: { hits: 3, t: 6, cd: 25 }, wind: { r: 4.5, cd: 6 }, blink: { cd: 20 }, heal: 0.25 } };
WIZ.seller = WIZ.teacher; WIZ.wanderer = { ...WIZ.teacher, range: [8, 18] };
export const NPC_COST = { Stupefy: 12, SapiraDuel: 20, IceDuel: 10, LevitateDuel: 6, AvadaKedavra: 25, Protection: 5, ProtectionMaxima: 20, Wind: 8 }; // = Combat.SPELL_COST of the base spell
export const ROLE_RU = { student: ['Ученик','Ученица'], teacher: ['Наставник','Наставница'], seller: ['Торговец свитками','Торговка свитками'], master: ['Мастер','Мастер'], wanderer: ['Странник','Странница'] };
export function wizardRoster(def, idx)  // deterministic like rosterEntry: idx 0 master; 1..S seller (S = stalls.length, stall = idx−1);
                                        // S+1..S+T teacher (home = a cottage); rest student (home = the pseudo-house); def.kind 'wander': all 'wanderer'
                                        // returns { idx, role, female, name, home, stall, seed, brave: rng() }
export function duelStrength(role, mana, hp, luck) { const W = WIZ[role]; return W.skill * (mana / W.mana) + 0.35 * (hp / W.hp) + luck; }
export function decide(input, rng)   // §8
export function react(input, rng)    // §8
export function pickSpell(role, rng, { foeUsedAvada })
```
- "Twice as strong" is measured against the teacher: HP, ward, skill, mana ×2; cast interval ½.
- **Mana budget** (follows from the costs): a teacher bursts for about 9 s, then casts about once per 8–13 s; the Master bursts for about 8 s, then about once per 4.6 s. This is how a player tires them out.
- **Clash drain:** an NPC in a clash loses `0.05·W.mana` per second, matching a player's `1.5/30`.

### Model (`src/entities/VillagerModel.js`)
- **Lists.** *Append* (never insert) to `ROLES` the 5 wizard roles, so existing looks stay identical: the seed uses `ROLES.indexOf`. `TOOLS` += `'wand'`, `'staff'`. `MODES` += `'cast'`, `'practice'`, `'shield'`, `'offer'`.
- **`villagerLook` cases:**
  - robe: `L.dress = true` for both genders, `L.dressColor` by role (student `[0x2c4f9e,0x2f7a3e,0x8e2b2b,0xb8922a]`, teacher deep blue or violet, Master 0x3a1d5e with gold trim, wanderer grey or brown);
  - `L.hat` = `'wizard'` (Master `'wizardTall'`, wanderer `'wizardWide'`);
  - Master: `beard 'long'`, grey hair;
  - `L.tool = 'wand'`; the wanderer gets `'staff'` in the right hand (no left-hand slot).
- **Hat (C15).**
  - A **separate mesh**: `this.hatPivot` is an `Object3D` on `this.head` at head-local (0, 1.2, 0.55) (the back of the brim), and `this.hat` is a mesh under it.
  - Shape: brim 1.7×0.08×1.7 at head-y 1.22, crown tiers 1.15/0.85/0.55 × 0.3/0.3/0.25, bent tip 0.3×0.2 shifted back 0.15.
  - **Top ≤ 3.65 local** (about 0.95 m above the bare head); `wizardTall` ≤ 3.8 including the star.
  - `setHatTilt(k)`: target `hatPivot.rotation.x = −0.75·k`, smoothed in `update`.
  - At most 12 meshes per wizard (cap 16).
- **Wand / staff:** `toolBoxes('wand')` is a handle 0.09×0.3, a shaft 0.06×0.75 and a tip 0.07 (crystal colour for the Master); `'staff'` is 0.1×2.4 with a crystal top. `TIP_Y = { wand: 1.05, staff: 2.45 }`.
- **New methods:**
  - `getWandTip(out)`: `this.tool.updateWorldMatrix(true,false); return this.tool.localToWorld(out.set(0, TIP_Y[kind], 0))`; falls back to `getRightHandWorldPosition`.
  - `getWandDir(out)`: tip − `localToWorld(0,0,0)`, normalized.
  - `setAim(pitch)`.
- **Poses (C12).**
  - `cast`: `aRX = π/2 + aimPitch`, `wrist = −π/2 − aRX` (the wand continues the forearm), plus a 0.12 s flick of `wrist −= 0.3` when `castNow`.
  - `practice`: `aRX = 1.1 + 0.3·sin t`, `aRZ = −0.3·sin 2t`, `wrist = −π/2 − aRX + 0.4`.
  - `shield`: `aLX = π/2`, `aLZ = 0.2`.
  - `offer`: `aLX = 1.2`.
- **Speech bubble** at `v.y + 5.6` for wizards; health bar at `+6.0` (Master `+6.3`).

### `CastleLife.js` integration (exact hooks)
- `import { WizardLife } from './WizardLife.js'`; `this.wizards = new WizardLife(this)`.
- `isWizSite = (def) => def.kind === 'tower' || def.kind === 'wander'`.
- **`_roster(def, idx)`** returns `isWizSite(def) ? wizardRoster(def, idx) : rosterEntry(def, idx)`. Use it in `_activate`, `_freeCommoner`, `_homesOf`.
- **`_activate`:**
  - `const S = e.role in WIZ ? { hp: WIZ[e.role].hp, armor: WIZ[e.role].ward } : STATS[e.role]`;
  - `title = WIZ_ROLE_RU[e.role]?.[e.female ? 1 : 0] ?? roleTitle(e)`;
  - `v.wizard = e.role in WIZ`;
  - wizards get `mana`, `castCd`, `domeCd`, `windCd`, `blinkCd`, `fx: 0`, `aimPitch: 0`.
  - The ward is stored in `v.armor` / `v.maxArmor`, so the `vil` tuple is unchanged.
- **Shouts:** `SHOUT.ambient` gets entries for every wizard role (avoids the `pick(undefined)` crash).
- **`_scan`:** skips runtimes of kind `'wander'`. Wander runtimes always stay `awake: false`.
- **`_wake`:** `if (isWizSite(def)) { this._makeChests(cs); if (this.auth) this.wizards.wake(cs); return; }` (after `cs.awake = true`).
- **`update`:** `cs.awake && (isWizSite(cs.def) ? this.wizards.crowd(cs, dt) : this._crowd(cs, dt))`; `this.wizards.update(dt)` (host: bolt reactions, spawning wanderers, FX timers).
- **`_think`:** directly after `if (v.climb) {...}`, add `if (v.wizard && this.wizards.think(v, dt)) return;`.
  - `think` handles the hostile look, the fight, and the wizard-only jobs (`teach`, `brew`, `class`, `watch`, `travel`, `guide`).
  - It returns `false` to let the generic code run (flee, bow, talk, follow, `king` / `sit` / `guard` / `stall` / `home` / `wander`).
  - Generic `_fight` is never reached for wizards.
- **Flee branch (`:611–623`):** `if (!g2.nodes.length) { this._steer(v, v.x + (v.x - fp.x), v.z + (v.z - fp.z), RUN, dt); ... }` (C16).
- **Seated jobs:** add `case 'sit':` next to `'king'` (seated at the post); `v.job === 'king' || v.job === 'sit'` where seating is set.
- **`_nextTrip`:** `if (v.wizard) return this.wizards.nextTrip(v);`.
- **`hit()`:**
  ```js
  if (!this.auth) { sync.villagerHit(v.id, dmg, dir2, (opts.magic ? 1 : 0) | (opts.spell ? 2 : 0)); ... }   // C19
  ...
  if (v.wizard) { if (!this.wizards.damage(v, dmg, dir, opts)) { this._flash(v); return; } }   // dome/shield/ward/Avada-ward; false = absorbed
  else if (opts.pierce) v.hp = 0; else if (v.armor > 0) {...} else v.hp -= dmg;
  ```
- **`hitAt` / `hitRay`:** skip `v.id === by` (C11).
- **`_die`:** `if (v.role === 'king') this._capture(...); else if (v.role === 'master') this.wizards.masterFell(v.cs, by);`.
- **Crime handlers:** `_offence`, `damaged` (per def), `theft` start with `if (isWizSite(cs.def)) return this.wizards.offence(...)` (and `damaged` / `theft` likewise).
- **`_say`:** colour wizards `'#5b2d8e'`; no other change (voice noting is in `CastleTalk.voice`).
- **`_updateBar`:** armour colour `v.wizard ? '#5aa0ff' : '#b8c2cc'`.
- **`_lockHint`:** for tower chests, «🔒 Сундуки академии откроются, когда падёт Мастер».
- **`_announceCapture`:** for a tower, «🧙 Мастер академии «…» повержен — хранилище открыто», and never «захватил».
- **`_netSend` / `applyNet`:** append `fx` (index 10) and `round(aimPitch*100)/100` (index 11).
  - Guests: `v.fx = fx ?? 0`; `v.aimPitch = pitch ?? 0`.
  - `if (fx & FX.BLINK) { v.x = x; v.y = y; v.z = z; }` (snap) and draw the smoke.
- **`_runtimeById(cid)`:** `const def = this.index.byId(cid); return def ? this._runtime(def) : null;`.
- **Visibility:** in the per-frame loop, inside a tower land, hide wizards more than 9 m vertically from the player (`visible = d < VIEW && !(inTower && |v.y − feetY| > 9)`). Only visible ones animate.
- **Hat tilt (every computer, visible wizards, every 0.25 s):** `const L = Math.round(v.y + 1.5); v.model.setHatTilt(t.solidIn(round(v.x), round(v.z), L + 5, L + 6) ? 1 : 0)`.

### Jobs (`WizardLife.wake` / `crowd` / `think`; host)
Use `g.isNight`, not `dayPhase`.

**Day:**
- **Master:** job `'sit'` at `def.throne`. Every 3–5 min he switches to `'guard'` at the `telescope` spot for 60 s, with practice sparkles.
- **Teacher 1:** `'teach'` at the lectern (mode `talk`); now and then 0.3 s of sparks at the nearest dummy.
- **Teacher 2:** `'brew'` at a cauldron (mode `work` + green bubbles).
- **Other teachers:** wander.
- **Seller:** `'stall'` at `stall.back`.
- **Students:** 3 at desks (`'sit'` + practice), 2 in the library.
- **Crowd:** `want = round(min(6, 2 + pop/12) × (night ? 0.3 : 1) × q)`, spawning from `home` nodes 22–70 m from the player.
- **Families:** cottages bring out 1 person (`spawnFamily` dispatch: wizard `want = 1`; the pseudo-house 2).

**Night:**
- Students stay in the dorm (the families only).
- 2 teachers on `'watch'` at `def.posts` with Lumos FX, casting `SapiraDuel` at zombies within 25 m with `castNpc(v, 'SapiraDuel', { kind: 'z', id })`.
- The Master stargazes. The seller is gone (`_merchantOf` finds nobody, so «Закрыто до утра» on talk).

**Budget:** about 8 fixed + ≤ 6 crowd + ≤ 8 family, so **≤ 22 active wizards** at one tower. Castles run 40+.

### Practice FX (`src/fx/WizardFx.js`, every computer, from `v.fx`)
- **Bits:** `FX = { LUMOS:1, SHIELD:2, DOME:4, LEV:8, SPARK:16, DRAW:32, CAST:64, BLINK:128, OFFER:256, BREW:512, LEVFAIL:1024 }`.
- **Rules:** the host starts practice at the end of a `waitT` (15 %), only within 40 m of a player, at most 3 at once, never while the site is hostile.
- **Leviosa:** a prop (book / feather / apple) from a pool of 6 created at start (`makeItemModel`, `makeBookModel`) floats at `tip + wandDir·2.2 + (0, 0.6 + 0.25 sin 2t, 0)`.
  - `LEVFAIL`: rises 0.5 m, wobbles, drops; the teacher says «Не Левиоса́, а Леви́оса!».
- **Lumos:** an additive glow sprite at the tip (no new `PointLight`s).
- **Sparks:** `duel._drawBolt(spell, tip, dummyPt, v.id)` every frame for 0.3 s. Drawing only: no bolt, no hit, no network.
- **Drawing:** a `SegmentPool` trail. **Brewing:** green particles over POTION.
- **Shield / dome / blink smoke** meshes are pooled per wizard.
- **Prewarm:** every FX mesh, sprite, prop and the dome go into the prewarm zoo (`Game.js:1600`), so no shader compiles mid-game.
- **Beacon (optional, author decision):** a violet column above the finial, `fog: false`, additive, opacity 0.12, at dusk and night.

---

## 8. Talk, voice echo and trade

### Voice echo (C9), in Phase 2 because practice lines start speaking
- **`VoiceGate`:** add `echoes(name, t)`, which returns true when a remote note with the same base exists within `ECHO`.
- **`CastleTalk.voice`:** after the range check, `const sp = matchSpell(text); if (sp) g.voiceGate?.noteRemote(sp, performance.now() + Math.min(8000, 400 + text.length * 70));`. Also note it again in the `onEnd` callback of `speech.say`.
- **`main.js:374`:** `if (heard && (game.remotes?.size > 0 || game.voiceGate.echoes(heard, performance.now()))) { const gate = game.voiceGate.check(...) ... }`.
- **NPC duel casts** go through `_say`, then `talk.voice`, so they are noted on every computer. `castNpc` also calls `noteRemote` itself, for when the voice is muted.

### Routing questions about spells (C10)
- **`main.js:385`:** `const ask = heard && !name && isFinal && game.castleLife?.talk?.isSpellQuestion(command);` and the condition becomes `(!heard || heard === 'Stand' || ask)`.
- **`isSpellQuestion(text)`:** a teacher, the Master or a wanderer is within `HEAR`, and `/(научи|объясни|расскажи|как (колдовать|наколдовать|сделать|работает)|что (такое|делает))/` matches.
- **`CastleTalk.hear`:** `ctx.askedSpell = matchSpell(text)`. VillagerBrain stays pure.

### `VillagerBrain.js`
- **Roles and pools.**
  - `ROLES` += wizard roles; `ROLE_RU`, `ROLE_TOPICS` for each.
  - New `P.wizard` layer: `_pool` order is `[P[role]?.[key], this.wizard ? P.wizard[key] : null, P.common[key]]`.
  - `P.wizard` must cover:
    - `who`, `job`, `small` (≥ 20 lines), `smallNight`, `danger`;
    - `aboutCastle` (the academy, its floors), `aboutKing` (the Master), `kingName`;
    - `whereMarket` (the shop), `whereThrone` / `whereKing` (the study), `whereGate`, `notMerchant` («Свитки продаёт {seller} внизу»);
    - `magic`, `zombies`, `food`;
    - `witness*` («Мастер! На нас напали!», never «Стража»), `claimKingLaugh`, `bowRefuse`, `kingSmall`.
  - Every wizard role must pass the existing all-`ROLES` tests (non-empty Russian, ≥ 15 distinct small-talk lines, no repeats).
- **Ruler words.** Brain world `{ kind, rulerWords }`; `_fill` uses `w.rulerWords ?? (kingF ? QUEEN : KING)`. Tower: `['Мастер','Мастера','Мастеру','Мастером']`; `{castle}` is the tower name.
- **Intents.** No new where-intents.
  - `T_MARKET` += `свитк`; `T_KING` += `мастер|директор|ректор`.
  - Map the guide tags by site kind in `CastleTalk._apply`: `guide:market` → `stall`, `guide:throne` → `room:study`, `guide:gate` → `towerGate`.
  - New intent `teach_spell` (before `magic` in `RULES`): `научи|объясни|как колдовать|как наколдовать`.
- **Teaching.**
  - Teachers and the Master look up `SPELLS` from `src/ui/Codex.js`: `card = SPELLS.find(s => s.name === SPELL_RU[base(ctx.askedSpell)])`.
  - Reply: `«${card.name}»: ${card.say}. ${firstSentence(card.desc)}`.
  - Without a match: «Какое заклинание? Назови его».
- **Trading.** `this.trader = ['merchant','seller','wanderer'].includes(role)` replaces `role === 'merchant'` in the trade intents, `_greetLine`, `ambient` and talkativeness. `noMagicSell` does not apply to traders.
- **LLM persona:** «Ты — {name}, {role} в академии волшебников «{tower}». Глава академии — Мастер {master}.»

### `CastleTalk.js`
- `brain()` world adds `kind`, `rulerWords`.
- `_ctx`: `nearbyGoods` for traders; `askedSpell`; wanderer context `nearestTower` / `nearestCastle` from **`knownNear` only**, as `{ name, dirWord, dist }`.
- `_merchantOf` accepts `'seller'`.
- `nameOf(it)`: scrolls get `scrollName(it)` from ItemTypes («свиток здоровья +3», «свиток силы +5», «свиток «Lightning Strike»», «свиток полёта»).
- **Restocking.** `_restock` for `def.kind === 'tower'`: 3 × `rollShopScroll(rng)` per counter, where `rng` is seeded from `(gx, gz, slot, k, floor(now/600000))`. Restock every 90 s. Host only, as now.
- **NPC-held goods (C20).**
  - The NPC must be standing (mode `offer`, speed 0). `spawnLoose(item, handPt, { hover: true })` with `item.shop = { npc: v.id, price }`.
  - If the NPC moves or 30 s pass, the offer is withdrawn with `items.pickUp(uid, '#npc')`.
  - `tookGood`: `if (item.shop.npc) { v = this.life.byId.get(item.shop.npc); ... }` before the `stall.split`.
  - `_unpaid` / `_watchMarket`: npc goods count as theft beyond 14 m from that NPC; the NPC shouts «Вор!» and calls `reportCrime(v, me, 'theft')`.

### Prices (`ItemTypes.scrollShopPrice`)
Every price is above `itemValue`; a unit test checks it.

| scroll | price at the tower | `itemValue` (merchant pays) |
|---|---|---|
| health +n (1–5) | 70 + 10n | 60 |
| strength (`fatigue`) +n (1–10) | 65 + 5n | 60 |
| To the Sun | 240 | 220 |
| Thunderwave | 260 | 220 |
| Lightning Strike | 320 | 220 |
| Flight (5 % on the counter, or the Master by voice) | 380 | 220 |
| Avada (#121) | waits for #121 | |

Shares in `rollShopScroll`: common 70 % (hp / fatigue), spell 25 %, flight 5 %.

**Voices** (`Speech.js` `ROLE_VOICE`): student higher and quicker, teacher calm, Master slow and low, seller lively, wanderer slow.

---

## 9. Self-defence, duels and the network

### `WizardLife.offence(cs, by, victim, killed, pos)`
- **Witnesses:** within `SEE` with line of sight, plus the living victim.
- **Fighters** (teacher, seller, Master, wanderer, and students with `brave ≥ 0.55`): `foe = by`, one line each («Защищайся!», «Ты пожалеешь, что пришёл сюда!»).
- **Other students:** flee into the tower or houses, calling «Мастер! Помогите!».
- **Alarm:** teachers within 60 m come.
- **Master:** if the attack happened inside the land, he blinks: a node 10–14 m from the attacker on the same level (|dy| < 2.5) with line of sight; `FX.BLINK`; cooldown 20 s.
- **Hostility:** `cs.hostile` for 180 s.
- **HUD and alarm:** the local player sees «✨ Волшебники защищаются!»; guests get `valarm` with `kind: 'tower'`.
- **`damaged`:** teachers investigate, as knights do.
- **`theft`:** the house's own wizard and teachers nearby fight; the others shout.
- **`think` hostile look:** every 0.6 s, fighters check `cs.hostile` players within 26 m in sight, the same as knights.

### `WizardLife.fight(v, dt)` (host)
- Timers first: `castCd`, `domeCd`, `windCd`, `blinkCd` −= dt; mana regen; `sees` cached for 0.3 s.
- `v.aimPitch` comes from the wand tip to the foe's centre; `setAim`.
- Then `decide({...})` is a pure function, and the action is applied:
  - `cast`: `duel.castNpc(v, spell, { kind: 'p', id: foe })`; `castCd = W.cast·(0.85 + 0.3·rng)`; `mana −= NPC_COST`.
  - `dome`: Protection Maxima, `FX.DOME`, 3 hits / 6 s, cost 20.
  - `wind`: `g.spells.cast('Wind', tip, dir, 'right', v.id)` plus `sync.spell('Wind', tip, dir, 'right', v.id)`.
  - `blink`.
  - `move`: keep the range band, strafe; when out of sight, sidestep 3 m.
  - `flee`.
  - `hold`: «Уходи и не возвращайся!».
  - `clash`: stay still, wand on the foe.
- Mode: `'cast'` while casting, in a clash or standing; `'run'` while moving.

### `decide` rules (each is a unit test)
1. A student flees when HP < 30 % or `brave < 0.55`.
2. In a clash: `{a:'clash'}`. A student gives up (`v.duelGiveUp = true`) when `p < 0.2` and mana < 5. The Master never gives up.
3. Master:
   - `dome` when it is ready and (HP < 60 % or ≥ 2 charges are incoming);
   - `wind` when the foe is closer than 4.5 m;
   - `blink` when the foe has stayed within 3 m for more than 1.5 s.
4. **Mercy rule:** `hold` if the foe is stunned, frozen or lifted, unless this wizard was hurt in the last 5 s.
5. `move` when outside `W.range` or out of sight.
6. `cast` when the cooldown is ready, mana ≥ cost and the foe is in sight. `pickSpell` gives Avada only to the Master and only if `cs.avadaBy.has(foe)` (author decision).
7. Otherwise `wait`, facing the foe.

### What the host knows about the foe (C18)
- **Local player:** `g.combat.stunned || g.combat.frozen || g.levitation.lifted`.
- **Guests:**
  - `Combat.serialize` gets a 5th field `Math.ceil(this.stunLeft)`; `RemoteAvatar.applyState` sets `this.combat.stunned = (s.c[4] || 0) > 0`.
  - The NetSync `'lift'` handler also calls `g.castleLife?.wizards?.onLift(m)` when `m.by` is an NPC id. This records `v.holding = { pid, on }`.

### Reacting to incoming charges
In `WizardLife.update`, for each flying bolt with `tk === 'v'` aimed at a wizard and not yet seen:
- after `W.reactT`, call `react({ role, mana, shieldReady, domeReady, spell, eta }, rng)` with probability `W.react`;
- `'counter'` (mana ≥ cost): `castNpc` back at `bolt.by`. `_detectClashes` pairs the two bolts.
- `'shield'`: `v.shield = { until: now + 2.5 s, yaw }`, `FX.SHIELD`.
- `'dome'`: Master only.

### `WizardLife.damage(v, dmg, dir, opts)` (from `CastleLife.hit`)
Returns `false` when the hit is fully absorbed.
- **Avada on a warded Master:** `opts.pierce && v.role === 'master' && v.armor > 0` sets `armor = 0`, a big flash, «Мастера не убить одним словом», and returns `false`. Otherwise `pierce` sets `hp = 0`.
- **Dome:** stops everything and loses one hit per block. A sword clangs with sparks at the dome surface.
  - While a dome is up, the local player is pushed out to `r_dome + 0.3`, like the 1.4 m push in `CastleLife.update`. The hands do not pass through.
- **Shield:** stops `opts.spell` when `dir` comes from the front ±60°.
- **Ward:** only against `opts.spell || opts.magic`. `a = min(armor, dmg)`; `armor −= a`; `hp −= 0.2a + (dmg − a)`.
- **Bare blows:** go straight to HP.
- **`applyToCreature` for wizards:**
  - Stupefy: `stunT = 15·stunK`. Ice: `8·stunK`. LevitateDuel: as now (`stunT = 3`, `vy = 11`).
  - A player's Leviosa grab on the Master: he breaks free after 2 s with `levitation.letGo('v', v, true)`, says «Протего!», and the host sends `levNo(by, 'v', v.id)` with `f: 1` (the guest shows «🛡️ Мастер вырвался»).
- **Regeneration:** out of a fight, the Master heals 0.25 HP/s; mana and ward regenerate for everyone.

### `masterFell(cs, by)`
- `st.kingDead = true`, `st.owner = null`; the vault and study chests unlock; `_sendState`.
- Students run. Teachers fight 30 s more, then say «Мы сдаёмся!» and drop the foe unless attacked again.
- No capture (author decision #2).

### `src/game/Duel.js`
- **`_npc(id)`:** `const v = this.game.castleLife?.byId.get(id); return v?.wizard && !v.dead ? v : null;`.
- **`castNpc(v, spell, target)`:**
  - origin = `getWandTip`, direction = to the target position;
  - `_addBolt({ id: `${v.id}:${nextId++}`, by: v.id, npc: true, spell, side: 'right', tk: target.kind, tid: target.id, o, d })`;
  - `sync?.duelCast(b)`; `voiceGate?.noteRemote(spell, now)`; `v.model.castNow = true`; `_burst`.
- **`_handOf`:** after the remote branch, `const v = this._npc(by); if (v) { v.model.getWandTip(outPos); v.model.getWandDir(outDir); return true; }`.
- **`_playerPos(id)`:** for an NPC, `(v.x, v.y + 2.4, v.z)`.
- **`_strength(id)`:** for an NPC, `duelStrength(v.role, v.mana, v.hp, luck)`.
- **`_contact(id)`:** for an NPC, `{ ok: !(v.stunT > 0) && !v.lev, jerk: !!v.duelGiveUp }`.
- **`_detectClashes`:** `CASTER_KINDS = new Set(['p','v'])` replaces `tk !== 'p'` (both sides).
- **`_arriveAtMe`:** `CASTER_KINDS.has(o.tk)`.
- **`_arriveAtCreature`:** `if (c?.wizard && this.game.castleLife.wizards.blocksBolt(c, b)) { this._end(b, 'blocked'); return; }`.
- **`_finishClash` (C7):** after the existing branches, `else if (this._referee() && this._npc(loser)) this.applyToCreature(winnerBolt.spell, this._npc(loser), winnerBolt.by);`.
- **`_end` (C8):** broadcast also when `b.npc && this.game.authority`.
- **`applyToMe` from an NPC in Creative** (`!combat.enabled`): Stupefy stuns for 5 s.

### Levitation
- `holdPoint`: skip the freshness check when `g.castleLife?.byId.get(by)?.wizard`.
- **The NPC lets go after 3 s, gently.** The Master instead carries the foe towards `towerGate` (turning towards it) and then sets them down gently.
  - **Local foe:** `g.levitation.dropMe(true)` when `lifted.by === v.id`.
  - **Guest foe:** `sync.lev('p', pid, 'right', 3, false, true, v.id)`.

### `Game.js`
- `playerName(id)`: `?? (castleLife.byId.get(id) ? `${v.title} ${v.name}` : null)`.
- `handPose(casterId)`: NPC branch returning `{ origin: tip, dir }`.
- **`birdRay` (C11):** the hook signature becomes `(o, d, len, w, name, casterId)` (`SpellManager.js:189` passes `casterId`).
  - Wind / WindMaxima: only `books.hitRay` and `houses.hitRay`.
  - Otherwise `castleLife.hitRay(..., casterId === 'local' ? this.localId : casterId)`, and the same for animals.

### Network (no new message types)
| message | change |
|---|---|
| `vil` | 2 more fields: `fx` (10), `aimPitch` (11); the ward is in `armor` |
| `vhit` | `mg` is now bits: 1 = magic weapon, 2 = spell; host `{ magic: !!(m.mg & 1), spell: !!(m.mg & 2) }` (old guests send 0/1) |
| `spell` / `lev` | optional `by`: `spell(name, o, d, side, by = this.me)`, `lev(k, id, side, hold, on, gentle, by = this.me)` |
| `valarm` | `kind` |
| `levno` | `f` flag |
| `p` | combat array gets a 5th element (stun) |
| `duel` / `dend` / `clash` / `clashend` | carry NPC bolts unchanged |
| `vsay`, `vtalk`, `vcrime`, `cst`, `tsell`, `inew`, `glass`, `bed`, `door` | unchanged |

- **Every computer:** tower parts, houses (glass, beds, doors), WizardFx from `fx`, hat tilt.
- **Host only:** people, AI, bolts, restocking, wanderers.

### Wandering wizards
- **Identity:** `wanderDef(gx, gz)` on a 700 m grid: `{ id: 'ww'+gx+'_'+gz, kind: 'wander', population: 3, knights: 0, stalls: [], houses: [], chests: [], nodes: [], edges: [], pens: [], fields: [], zone: 0, x, z, color: 0x7a6a55, name: 'Дороги' }`. The runtime stays `awake: false`.
- **Spawning** (host, every 20 s):
  - only when no wanderer is within 300 m of any player and the player is outside all site lands;
  - chance 0.06 by day, 0.03 at night (about one per 5–6 min; author's taste);
  - 70–110 m from a random player on dry ground with slope ≤ 2 over 4 m;
  - the roster index is the first one in the cell not yet killed.
- **Travel:**
  - destination: a castle gate or tower door 300–1200 m away **from `knownNear` only**, otherwise a far random point;
  - movement: `_steer` towards waypoints every 20 m; probe `heightAt.water` 6 m ahead and turn ±40°;
  - speed `WALK·0.9`; rests 20–40 s now and then; Lumos at night;
  - despawns (not killed) beyond 220 m from every player.
- **Meeting the player:**
  - greets within 12 m; talks as `wanderer`;
  - «проводи меня до башни» sets `guideFor`; he waits when the player is more than 25 m behind;
  - offers one scroll (shop price + 10 %) held out in `offer` mode.
- **Defence:** like a teacher. Hostility is personal: he gives up after 60 s or beyond 50 m.
- **Minimap:** violet dots (`Hud.drawMinimap` gets a `wanderers` argument).

---

## 10. Saves, old worlds, minimap, Codex

- **Saves: no format change.**
  - `wt…` / `ww…` states go into the `castles` snapshot; chests into `chests`; panes and beds into `houses` / `beds`; the shop is not saved.
  - `restore` → `applyState` → `index.byId` builds the definition. The «захватил» text is suppressed for towers.
- **Old worlds:** towers appear only in castle-free cells, so castles are unchanged.
  - Saved block edits and replayed explosions apply on top. A player's old building on that spot may cut into a tower.
  - If the author wants towers only in new worlds: add `gen: 2` to new saves and pass `towers: !!save.gen` through `TerrainData.generate` **and** `sanitizeConfig`, so guests build the same world.
- **Minimap (`Hud.drawMinimap`):**
  - iterate `castles.slice(0, 3)`;
  - label `(c.icon || '🏰') + ' ' + c.name.replace(/^(Замок|Крепость|Академия) /, '')`; the edge arrow uses the same icon;
  - `minimapCastles` keeps every name;
  - **do not touch the lake drawing** (CLAUDE.md).
- **Codex ITEMS:** 4 cards (Башня волшебников, Волшебники и Мастер, Лавка свитков, Волшебники-странники); the «Свиток» card adds «…или купить в Лавке свитков».
- **README:** a section «## Башня волшебников» after «## Замки».

---

## 11. Phased plan

**Phase 0: engine headroom** (small; review first)
- Terrain.js:
  - `MAX_LAYER = 56`; `MOUNTAIN_TOP = 36`;
  - blocks 49–56 with `BASE_COLORS` and `PATTERN_OF`; `PATTERN.CRYSTAL/RUNES`;
  - the `ring` / `k===2` branch;
  - **the C3 water fix.**
- VoxelShading 12/13 and their emissive light.
- Castles.js: exports, `Plan.sector`, the `buildHouse` style hooks (no-ops for castles).
- Tests: golden digests (§1), sector rotations, water fix, `castles.test.js` unchanged and green.

**Phase 1: placement and generation**
- `WizardTowers.js` (`TowerIndex` on the castle grid, spawn tower, `buildTowerSite`, `buildTower`, `buildGrounds`, `furnishTower` with segment aisles, `buildWizardHouses` with `decorate`), `Sites.js`.
- `TerrainData.generate`, `_buildCastles`, `_plantTrees`, and callers switched to `sites`.
- `tests/unit/wizard-towers.test.js` (§12).

**Phase 2: wizard people + echo gate**
- `WizardAI.js`, `WizardLife.js` (wake, crowd, jobs, practice, Lumos, nextTrip), `WizardFx.js` (+ prewarm).
- `VillagerModel` (roles, hat mesh + tilt, robes, wand / staff, poses, `getWandTip` / `getWandDir`).
- All `CastleLife` hooks of §7 (crash guards first); `vil` fields; hat tilt; per-floor culling.
- `VoiceGate.echoes` + `main.js` gate + `CastleTalk.voice` noting.
- Minimap through `sites.nearestForMap` + Hud 3 marks.
- `ItemTypes.rollWizardHouseLoot`; `Items.lootChest` (tower house loot, spell book); `Game.openChest` (`'vault'` uses the 260 branch).
- Tests: `villager-model.test.js` (wizard roles, per-role height caps: wizard ≤ 3.7, `wizardTall` ≤ 3.85; hat tilt lowers the top by ≥ 0.4), `wizard-ai.test.js` (roster, stats), `voice-gate.test.js` (an NPC note blocks the same spell in single-player when `lips !== true`).

**Phase 3: talk and trade**
- VillagerBrain (roles, `P.wizard`, ruler words, regex additions, `teach_spell`, persona).
- CastleTalk (seller, tower restock, `nameOf` scrolls, guide tags by kind, `isSpellQuestion`, npc goods).
- `main.js` routing; `ItemTypes` (`scrollShopPrice`, `rollShopScroll`, `scrollName`); `Speech` voices.
- Tests: brain (all existing all-`ROLES` tests green; wizard cases), `scroll-shop.test.js`.

**Phase 4: self-defence**
- `Duel.js` NPC casters + C7/C8; Levitation (`holdPoint`, NPC release, Master breaks free).
- `Game` (`playerName`, `handPose`, `birdRay` C11); `Combat.serialize` stun + RemoteAvatar.
- WizardLife (`offence`, `theft`, `fight`, `damage`, `blocksBolt`, reactions, dome, shield, wind, blink, `masterFell`, `onLift`).
- NetSync (`spell` / `lev` `by`, `valarm` kind, `vhit` bits, `levno` f, `lift` → `onLift`).
- Tests: `duel-npc.test.js`, `wizard-ai.test.js` decisions, e2e attack part.

**Phase 5: wandering wizards**
- `wanderDef`, spawn, travel, despawn, guide, npc scroll offer, minimap dots, `knownNear` contexts.

**Phase 6: multiplayer and saves check**
- `multiplayer.test.mjs` additions (§12); save and restore of a tower state and an opened vault chest.

**Phase 7: Codex, README, performance pass**
- Assert in e2e near the tower:
  - `terrain.stats.maxBuildMs < 40`;
  - active wizards ≤ 22;
  - ≤ 1 bolt per NPC; ≤ 3 NPCs casting at one foe (`_assignSlots`);
  - WizardFx only within 40 m;
  - no shader compile after prewarm: `renderer.info.programs.length` stable over 300 frames.

---

## 12. Tests

### `tests/unit/wizard-towers.test.js`
- **Deterministic:** two `TerrainData(4242)` give equal `towers.cellOf` id, x, z, `parts.length`, `nodes.length`, name for cells −7..7. The spawn tower exists with centre distance 358–1400.
- **Rarer:** over cells −8..7 (7.68 km), for seeds 4242, 12345, 1: `towers/km² < 0.5 × castles/km²`, and ≥ 8 towers.
- **Never overlapping:** for every tower `castles.cellOf(t.gx, t.gz) === null`; `castles.landAt` is null on a 4 m grid over `zone + BLEND`; the tower land square lies ≥ 10 m inside its cell.
- **Architecture:**
  - 7 levels; rooms include vault, hall, shop, library, classroom, alchemy, dorm, study, observatory (≥ 14 rooms);
  - door column air at F+1…F+5; `max L ≤ MAX_LAYER`; `topLayer(door) == F`;
  - an `ARCANE_LAMP` exists; no leaves in the zone.
- **Furniture present (C13/C14):**
  - the counter blocks exist; 6 bed spots; 3 vault chests + 1 study chest; 2 dummies; 2 cauldrons; ≥ 60 BOOKS blocks;
  - no bed or chest footprint is within 1 m of any graph edge segment;
  - every bed spot is at r ≤ 10.5.
- **Walkable** (copy of the castles test):
  - every node is standable;
  - every same-level edge is walkable in 0.5 m steps;
  - stair edges rise exactly 1 layer;
  - everything is reachable from `towerGate`; `stall`, `room:study`, `room:dorm`, `cauldron` are reachable.
- **Houses:** 4–6 cottages + the pseudo-house; each cottage has `doorRec.h === 6`, ≥ 1 chest, `wizard: true`, bed spots, and its door node linked to a ring-road node; `fields.length === 0 && pens.length === 0`.
- **Chunk split:** the union of `sites.partsForChunk` over the covering chunks equals `def.parts`.
- **Cost:** generating 64 tower cells (castles cached) takes < 60 ms.

### `tests/unit/wizard-ai.test.js`
- `WIZ.master.hp === 2*WIZ.teacher.hp`, skill ×2, cast ×½, `stunK` lower.
- `duelStrength('master', full) − 0.35 === 2·(duelStrength('teacher', full) − 0.35)`.
- `pickSpell`: a student never picks Ice, Leviosa or Avada; the Master picks Avada only with `foeUsedAvada`.
- `decide`: student at 25 % HP → flee; Master with 2 incoming and dome ready → dome; foe at 3 m → wind; foe stunned and not hurt for 6 s → hold; out of range → move; ready and in sight → cast; mana below cost → wait or move.
- `react`: rng below react with enough mana → counter; otherwise shield.
- `wizardRoster`: deterministic; idx 0 is the master; idx 1..S sellers with `stall = idx − 1`; teachers' homes are cottages; students' home is the pseudo-house.

### `tests/unit/duel-npc.test.js`
Duel through `Object.create(Duel.prototype)` with a stub game, as in `duel-turn.test.js`.
- `castNpc` origin equals the model's wand tip; `_handOf(npc)` direction equals `getWandDir`.
- A player bolt `tk:'v'` and an NPC bolt `tk:'p'` aimed at each other: `_detectClashes` starts a clash.
- `_finishClash` with the NPC as loser applies the winner's spell to the NPC (`stunT > 0` for Stupefy).
- `_end` of an NPC bolt on the host broadcasts `dend`.
- A shield facing the caster: `_arriveAtCreature` ends `'blocked'`. The dome absorbs 3 bolts and then breaks.
- `castleLife.hitRay` skips the caster; a Wind ray does no villager damage.

### `tests/unit/scroll-shop.test.js`
- For every scroll kind and amount, `scrollShopPrice > itemValue`.
- `rollShopScroll` is deterministic per seed; shares within ±5 % over 10k rolls.

### `tests/unit/villager-brain.test.js` (additions)
- A seller answers «сколько стоит свиток» with a price.
- A teacher with `ctx.askedSpell = 'Protection'` answers with text containing Codex's `say`.
- A wanderer with `nearestTower` says the direction word and the distance.
- Wizard witness lines contain «Мастер», never «Стража».

### e2e `tests/e2e/wizards.test.mjs`
`startFromMenu('freeworld')`.
1. **Find the tower.**
   - Pick the nearest tower: `sites.towers.knownNear(0, 0, 1500)` after `towers.spawnKey()`, or the spawn tower cell; assert `dist < 1400`.
   - Daytime; stand at `door` (y + 2.2); `flushAround`; wait 40 frames.
   - 🧙 name in `hud.minimapCastles`.
2. **Walk in.**
   - Along the graph path `towerGate → stall`, 0.5 m at a time, 2 frames each.
   - The deviation stays < 0.6 m; finish inside r < 15; `_indoorK > 0.5`.
3. **Buy.**
   - Give coins: `g.inventory.storeItem({ kind: 'coins', uid, count: 500 })`.
   - Goods from `T.stalls.get(id + ':s0')`; `g.items.pickUp`; `T.hear('да')`.
   - Assert `kind === 'scroll'`, no `.shop`, coins decreased by the price, price > `itemValue`.
4. **Attack and block, using poses (CLAUDE.md).**
   - Hit the seller with `onLocalHit(s, 2, null, true)`: `foe` and `hostile` are set.
   - `L.wizards.forceCast(s, 'SapiraDuel')` (a test hook; slow bolt) with the player 12 m away.
   - `feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40)`, then `castLocalSpell('Protection')`.
   - The duel log shows `'blocked'` for the NPC bolt.
5. **Clash.**
   - `forceCast(s, 'SapiraDuel')` again; turn the character to the seller.
   - `feed({ arms: 'forward' })` + `castLocalSpell('Остолбеней')`.
   - `g.duel.clashes.length >= 1` within 40 frames.
6. **The Master.**
   - `maxHp === 2 × teacher maxHp`.
   - `raiseDome(master)` gives `dome.hits === 3`.
   - A player `SapiraDuel` at him ends `'blocked'` and the dome has 2 hits left.
7. `realErrors(errors)` is empty; `terrain.stats.maxBuildMs < 40`.

### `multiplayer.test.mjs` addition
Host and guest near a tower.
- The guest's `castleLife.byId` has wizards with `model.hat`.
- The host forces `FX.LEV` on a student; the guest's WizardFx shows a prop.
- The host's `castNpc` at the guest: the guest's `duel.bolts` has it; `_handOf` resolves the NPC's wand tip; the guest's `voiceGate.echoes('Stupefy')` is true.
- The guest's fist hit reaches the host through `vhit` with bits; the ward drops only for a spell hit.
- The Master's death reaches the guest through `cst`; chests unlock; there is no «захватил» toast.

---

## 13. Open questions for the author (ask in Russian, simply)

1. Можно ли разрешить миру строить выше, чтобы башня была высокой, с остроконечной крышей? Горы и старые миры не изменятся. Если нельзя, будет 6 этажей с плоской крышей-обсерваторией.
2. Когда Мастер побеждён: открывается только хранилище, или игрок сам становится Мастером, как с королём?
3. Может ли Мастер ответить «Авадой» тому, кто сам применил её к волшебникам? Продавать ли свиток Авады у Мастера (500 монет), когда он появится?
4. Нужен ли светящийся луч над башней, чтобы её было видно издалека ночью?
5. Появляться ли башням в уже сохранённых мирах? В старом мире башня может встать там, где вы что-то строили.
6. Как часто встречать странников: примерно раз в 5 минут пути — нормально?

---

## Scratch files (nothing in the repo was changed)

All in `/tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/wt/`:
- `sim2.mjs` — towers in castle-free 480 m cells; density and spawn distance; run `node sim2.mjs 0.2`
- `cost.mjs` — castle-cell, tower-cell, minimap and chunk costs
- `golden.mjs` — the golden digests in §1
- `waterbug.mjs` — reproduces the `heightAt` water-flag bug
- `towerproto.mjs` — the spiral stair prototype; run `node towerproto.mjs 2.6 20`
- `sim.mjs`, `castF.mjs` — the original 1200 m-cell simulation and castle F values