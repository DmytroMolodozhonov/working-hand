/**
 * LiteMode.js — «Лёгкий режим» (the author 19.11: «у человека видеокарты вообще нет… отдельный режим, где супер крутой FPS, и он сам
 * будет переключаться, если заметит такую проблему»).
 *
 * For a computer whose picture is drawn by the PROCESSOR (no card, a «software» renderer) or by a very weak card. There the cost is
 * the number of triangles and draws (the processor's vertex work), not the card's pixels — so the ordinary «очень низкая» is still
 * slow. The mode: a short view (the land, the sea, the people drawn only ~45 m: `LITE_LEVEL.view`), a small picture, no shadows /
 * clouds / «Ультра», no magic flora and no far scenery; the game's rules are NOT changed (the same world, the same people).
 *
 * Settings → «Лёгкий режим»: «Авто» (default) / «Включён» / «Выключен».
 *   • «Авто» — on at the start when the renderer is a software one (`isSoftwareGpu`), or when the last time it had to be switched on
 *     (remembered: `zns-lite-auto`, forgotten after a smooth session); and it switches on BY ITSELF in the game when the frame rate stays
 *     low although the ordinary graphics is already at its lowest (`LiteWatch`): FPS < LOW_FPS for LOW_WINDOWS windows of 2 s in a row.
 *   • it does not come back by itself in the same session (no see-saw); after a long smooth stretch the next start tries the ordinary again.
 * «А если»: «Ультра» chosen — the light mode still wins when the player asks for it («Включён»), «Авто» in Ультра never switches (the player chose);
 * the first window after a load / a pause is ignored (frame > 1 s); a computer that is slow only for a moment (a village waking) does not
 * switch (LOW_WINDOWS in a row); a menu / a pause never counts; a changed setting during the game acts at once.
 * Only on this computer: nothing goes over the net.
 */
import { isSoftwareGpu } from './SystemSpecs.js';

export const LITE = {
    LOW_FPS: 24, // below this, window after window, in the lowest ordinary graphics → the light mode
    LOW_WINDOWS: 4, // × 2 s = 8 s of it in a row
    WINDOW_S: 2,
    SMOOTH_FPS: 50, // a session that ended smooth (in the light mode, with this much) forgets «had to switch»: next start tries the ordinary
    KEY: 'zns-lite-auto',
};

export const LITE_SETTINGS = ['auto', 'on', 'off'];

/** The setting string normalised ('auto' | 'on' | 'off'). */
export function liteSetting(v) {
    return v === 'on' || v === 'off' ? v : 'auto';
}

/** Should the game START in the light mode? hw: { gpuName, weak }, remembered: the stored flag. */
export function liteAtStart(setting, hw = {}, remembered = false) {
    const s = liteSetting(setting);
    if (s === 'on') return true;
    if (s === 'off') return false;
    return isSoftwareGpu(hw.gpuName) || !!remembered;
}

/** Watches the frame rate (pure: tests). feed(dt s, atLowest) → true on the frame the mode should switch on. */
export class LiteWatch {
    constructor(opt = {}) {
        this.o = { ...LITE, ...opt };
        this._acc = 0; this._frames = 0; this._low = 0;
        this.fps = 60;
    }
    feed(dt, atLowest = true) {
        if (!(dt > 0) || dt > 1) { this._acc = 0; this._frames = 0; return false; } // (a load / a pause / a tab in the back: not a measure)
        this._acc += dt; this._frames++;
        if (this._acc < this.o.WINDOW_S) return false;
        this.fps = this._frames / this._acc;
        this._acc = 0; this._frames = 0;
        this._low = atLowest && this.fps < this.o.LOW_FPS ? this._low + 1 : 0;
        return this._low >= this.o.LOW_WINDOWS;
    }
}

export class LiteMode {
    constructor(game, setting = 'auto', hw = {}) {
        this.game = game;
        this.setting = liteSetting(setting);
        this.on = false;
        this.byItself = false; // switched on in this session by the watch
        this.watch = new LiteWatch();
        this._smooth = 0; // s of smooth frames in the light mode
        const remembered = (() => { try { return localStorage.getItem(LITE.KEY) === '1'; } catch (e) { return false; } })();
        this._tests = typeof window !== 'undefined' && !!window.__ZNS_FIXED_QUALITY__; // (e2e tests draw in software: «Авто» would turn it on everywhere and change what they measure)
        this._startOn = liteAtStart(this.setting, hw, remembered) && !(this._tests && this.setting === 'auto');
    }

    /** Called once after the Game made its renderer and quality manager (before the first apply). */
    start() {
        if (this._startOn) this._set(true, 'start');
    }

    /** The settings changed during the game. */
    setSetting(v) {
        this.setting = liteSetting(v);
        if (this.setting === 'on') this._set(true, 'settings');
        else if (this.setting === 'off') { this._set(false, 'settings'); try { localStorage.removeItem(LITE.KEY); } catch (e) { /* not remembered */ } }
    }

    _set(on, why) {
        if (this.on === on) return;
        this.on = on;
        const g = this.game;
        g.quality?.setLite(on);
        if (on && g.ultra?.on) g.ultra.set(false); // (the light mode has no «Ультра»: no grass, no second picture)
        g.lite = on;
        g.world?.terrain?.setLiteLook?.(on); // (new chunks meshed in plain colours: fewer triangles)
        g.perf?.note?.(`⚡ Лёгкий режим ${on ? 'включён' : 'выключен'} (${why})${on ? ': короткая даль, маленькая картинка, без теней и облаков' : ''}`);
        g.hud?.setVoice?.(on ? '⚡ Включён «Лёгкий режим»: игра слишком тормозила — мир виден ближе, зато плавно. Выключить можно в настройках.' : '', on);
    }

    /** Every frame: the watch (only «Авто», not in Ultra, not already on). */
    update(dt) {
        const g = this.game, q = g.quality;
        if (this.on) {
            if (this.byItself || this.setting === 'auto') {
                if (dt > 0 && dt < 1 && 1 / dt > LITE.SMOOTH_FPS) this._smooth += dt; else this._smooth = Math.max(0, this._smooth - dt * 4);
                if (this._smooth > 300) { try { localStorage.removeItem(LITE.KEY); } catch (e) { /* ignore */ } this._smooth = -1e9; } // (next start tries the ordinary again)
            }
            return;
        }
        if (this.setting !== 'auto' || this._tests || q?.ultra || g.paused) return;
        const atLowest = !q || !q.auto || q.level <= 0; // («Авто» already at «очень низкая», or the player pinned a low one)
        if (this.watch.feed(dt, atLowest)) {
            this.byItself = true;
            try { localStorage.setItem(LITE.KEY, '1'); } catch (e) { /* not remembered */ }
            this._set(true, `FPS ${this.watch.fps.toFixed(0)} при самой низкой графике`);
        }
    }
}
