---
name: new-building
description: Чек-лист добавления нового здания, постройки или данжа (деревня, замок, развалина, подземелье): мерки, версия мира, прочность, жители, проверки, снимки.
---

# Новое здание / данж — чек-лист (сверяй с CLAUDE.md)

0. **Сначала продумай:** для чего здание, кто в нём работает, что внутри (мебель, сундуки, прилавок), где стоит (размер поселения, участок). «А если»: старый мир, крыша без опоры, ночь, жители в доме при тревоге, взрыв, игрок на крыше/прилавке (с него можно сойти).
1. **Мерки (не на глаз):** блок 1 м, герой ~3,5 м, дверь 3×6, проходы ≥ 3 блоков, этаж 8 м, ничего ниже 5 м над свободным полом (шляпа), прилавок 2 м, стол 2 м, сиденье 1,5 м; участок 17×14 (большой 26×26). Сверь с соседними зданиями.
2. **Здания поселений:** `src/world/Buildings.js` — `BUILDING_KINDS`, `BUILDERS`, `TRADE_OF`, `FLAVOR_OF`; места по размеру поселения (`townKinds`, `hamletKinds`, `placeTownBuildings`, `Hamlets.js`). Жилое — запись дома (`Castles.js`: дверь, стёкла, сундуки), с прилавком — запись `stalls` (`MarketGoods.SHOPS`).
3. **Данжи:** вид — строка в `KINDS` (`src/world/DungeonRules.js`) + строитель в `DungeonRuins.js` (`RUIN_BUILDERS`) или `DungeonBuild.js` (`UNDER_BUILDERS`) + тема в `DungeonKit.js`; под землёй не класть `STONE/GRAVEL/DEEPSTONE/DIRT/GRASS` в оболочку (порода пещер). Сундуки: `Kit.chest`, `flavor` по смыслу.
4. **Обстановка:** `src/world/CastleFurniture.js` (`ROOMS`, `pieces`, `MIN_ITEMS`) — мебель не на путях ходьбы, проходы связны.
5. **Жители и профессии:** `src/game/Trades.js` (`withTrade`, `TRADE_TITLES`, `TRADE_PROMPTS`), роль прежняя; новая роль — `COMMAND_ROLES`/`canDo`.
6. **Движение и звук:** `src/game/BuildingFx.js` — одна общая форма и материал, шейдер в `Game.prewarm`; колокол/дым — по тревоге `castleLife.alarm`.
7. **Прочность и коллизии:** новый блок — строка в `STUFF` (`src/world/Structure.js`); коллизия сразу; ничто не висит в воздухе; разрушение передаёт снятые блоки в `collapseAfter`.
8. **Версия мира:** константа `*_FROM_GEN` в `src/world/Terrain.js` (рядом `BUILDINGS_FROM_GEN`, `DUNGEON_FROM_GEN`, `HOUSE_SIZE_FROM_GEN`), опция через `World`/`TerrainView`/воркер; старые миры не меняются.
9. **FPS:** строится в воркерах, части одного материала сливаются (`src/core/MergeGeometry.js`), без долгой работы в кадре.
10. **Проверки:** `node tools/buildbench.mjs [вид] --fits`, `dungeonbench.mjs --check`, `structbench.mjs --check`, `furnishbench.mjs`, `housebench.mjs`; снимки `tools/buildings-screenshots.mjs`, `dungeon-screenshots.mjs`, `house-screenshots.mjs`; тесты `tests/unit/buildings.test.js`, `dungeons.test.js`, `castle-furniture.test.js`, `big-houses.test.js`.
11. **Справочник:** «Здания в деревнях и замках» в `src/ui/Codex.js`, на «вы».
12. **Отчёт:** строка на каждый «а если» + размеры числами.

## Если чего-то не хватило
Нашёл новое место в коде или ошибку, которую пришлось ловить, — допиши строкой в нужный пункт и закоммить вместе с работой. Правила — сначала в CLAUDE.md, потом сюда; не дублируй его, устаревшее удаляй.
