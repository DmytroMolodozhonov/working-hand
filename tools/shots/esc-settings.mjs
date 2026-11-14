// Diagnostics: Escape with «Общие настройки» open in the pause menu — where the page lives and how it looks afterwards.   node tools/shot.mjs esc-settings --mode creative
export default async function (h) {
    const key = (k) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(e); window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
    const state = (tag) => {
        const p = document.getElementById('tab-settings');
        const pm = document.getElementById('pause-menu');
        const r = p?.getBoundingClientRect();
        h.log(tag, 'parent', p?.parentElement?.id || p?.parentElement?.className, '| class', p?.className, '| display', JSON.stringify(p?.style.display), '| computed', p && getComputedStyle(p).display, '| rect', r && [r.width | 0, r.height | 0].join('x'), '| pause hidden', pm?.classList.contains('hidden'), '| main-menu', document.getElementById('main-menu')?.className);
    };
    await h.frames(30);
    state('start');
    key('Escape'); await h.frames(10); state('after Esc (pause open)');
    document.querySelector('[data-pause-tab="pause-settings"]')?.click(); await h.frames(10); state('settings tab');
    await h.shot('settings-open', { settle: 1 });
    key('Escape'); await h.frames(10); state('after Esc in settings (pause closed)');
    key('Escape'); await h.frames(10); state('Esc again (pause open)');
    await h.shot('pause-again', { settle: 1 });
    document.querySelector('[data-pause-tab="pause-settings"]')?.click(); await h.frames(10); state('settings tab again');
    await h.shot('settings-again', { settle: 1 });
}
