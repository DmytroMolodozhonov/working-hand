---
name: new-creature
description: Чек-лист добавления нового существа (человекоподобное, зверь, летающее, морское, магическое, босс): таблицы «кто/что», ходьба, Империус, сеть, смерть, модель, тесты. Используй при любой задаче «добавь существо/животное/монстра/босса».
---

# Новое существо — чек-лист (сверяй с CLAUDE.md)

0а. **Воспользуйся скиллом `optimization`** — код сразу под видеокарту и без просадок FPS.
0. **Сначала продумай:** кто это (тип, размер от мерок мира: блок 1 м, герой ~3,5 м, глаза ≈ 3,4 м, ноги = `group.y − PLAYER_GROUND_OFFSET`), где живёт (мир, ночь, вода, воздух), что умеет, чем опасно. Список «а если» — ДО кода (сон, смерть, сеть, хост ушёл, старое сохранение, корабль, космос, два игрока на одно существо).
1. **Модель — без примитива:** настоящая анатомия, детали, вариации окраса/размера, текстура с зерном; много частей — через `src/core/FarShape.js` (кости, запечённые цвета) и `src/core/MergeGeometry.js`, общие геометрии в кэше, образец в `Game.prewarm`. Чужие образцы: `src/entities/` (`VillagerModel.js`, `Zombie.js`, `MonsterBody.js`), снимок — `tools/creature-screenshots.mjs`. Сверь с соседними моделями числами (Box3).
2. **Заклинания «кто/что»:** строка во ВСЕ места поиска целей — `Duel._bodies/_creature`, `Game.explode`, `birdRay/lightningAt`, `CreatureImpact.js`, `Levitation.js`, `WaterVortex.js` (+ `Overgrown.js`, `Liquidation.js`, `TotalDestruction.js`, `Burning.js` по смыслу). «Не действует» — с причиной. Тест `tests/unit/spell-targets.test.js` (допиши вид), `creature-impact.test.js`. Лапа монстра пентаграммы — строка в `GRAB_TARGETS` (`GrabRules.js`: берётся ли, вес, рост) и в `MonsterGrab._nearest`.
3. **Ходьба:** ходящее — в `CrowdSources.js` (с размером) и ходит через `crowdStep` (`Crowd.js`/`Pilot.js`, замер `node tools/crowdbench.mjs`, `pilotsim.mjs`); склоны — `HillWay.js` (`trackSlope`, `slopePace`); землю вдали ждёт `TerrainData.landMade`, не делает в кадре. Летающее/морское — свои адаптеры (`Dragons.js`, `Sailors.js`).
4. **Устойчивость и сбивание:** строка в `steadyKind`/`NPC_STEADY` (`src/game/Steadiness.js`), тесты `steadiness*.test.js`.
5. **Империус:** строка в `IMPERIUS_TARGETS` (`Imperius.js`), адаптер в `ImperiusBodies.js`/`ImperiusFlyers.js`/`ImperiusWalkers.js`, хук `g.imperius.step(sys, c, dt)` (хост и гость). Тест `imperius.test.js`.
6. **Люди и реакции:** человекоподобное — `COMMAND_ROLES`/`canDo` (`src/ai/TalkCommands.js`), `eff`/`emotionOf`, `LORD_REACT`; опасное — `Danger.js`/`VillagerFear.js`, рыцари отвечают на угрозу (как `Gargoyles.knightStep`); невидимое — `Invisibles.js`.
7. **Бой и смерть:** `Combat.js`, отрубание частей (`Dismember.js`, `SeveredPart.js`), останки и тела (`Death.js`, `DEATH.MAX_BODIES`), `Legacy.js` если касается героя. Лицом к цели перед атакой.
8. **Сеть и сохранение:** хост ведёт, гости доигрывают позу и звук (`NetSync.js`, `RemoteAvatar.js`); состояние в сохранении (`WorldSave.js`); старые миры не ломать (версия `*_FROM_GEN` в `src/world/Terrain.js`, если создаётся при генерации).
9. **Космос/планеты:** `Space.js` (`spaceSpellBlock`, `offEarth`), `src/world/Planets.js` — решить, бывает ли там.
10. **Босс:** сундук(и) по смыслу босса (кроме паучихи), ачивка (`Achievements.js`, награда ячейками маны; «Высший маг» — за все).
11. **Звук и справочник:** свой звук (`src/audio/*Sounds.js`, `SoundManager`, синтез заранее), карточка в `src/ui/Codex.js` («польза → как пользоваться», на «вы»).
12. **FPS:** без долгой работы в кадре, нет копления со временем (убирать вдали), `node tools/creativebench.mjs --check`, `flightbench.mjs --check`, `soakbench.mjs`.
13. **Отчёт:** строка на каждый «а если» + размеры числами.

## Если чего-то не хватило
Нашёл новое место в коде или новую таблицу «кто/что» — допиши строкой в нужный пункт и закоммить вместе с работой. Правила — сначала в CLAUDE.md, потом сюда; не дублируй его, устаревшее удаляй.
