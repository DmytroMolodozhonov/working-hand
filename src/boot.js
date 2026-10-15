/**
 * boot.js — the first script of the game page: in the game's own window the saves are brought over
 * from the usual browser profile (once, ProfileTransfer.js), then the game itself starts (main.js).
 */
import { transferIntoOwnProfile } from './core/ProfileTransfer.js';

try { await transferIntoOwnProfile(); } catch (e) { console.warn('[Профиль] перенос сохранений не удался', e); }
import('./main.js').catch((e) => { window.__znsLoadFailed && window.__znsLoadFailed(); throw e; });
