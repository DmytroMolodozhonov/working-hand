/**
 * arcaneBoot.js — the menu's magic shapes at once, before the rest of the game is loaded (the author 06.11: «загружается обнова, после
 * этого на секунду-две старый интерфейс всегда показывается»): the shapes were given by MagicUi, which comes with the whole game.
 * Small and alone (no other module), so it runs first; magic-ui/arcane-ui.css keep the menu hidden until it is shaped (≤ 2.5 s).
 */
import { arcaneShapes } from './ArcaneShapes.js';

try { arcaneShapes().apply(); } catch (e) { console.warn('arcaneBoot:', e?.message || e); }
