// StatusStack.js — the bars of a process of mine (a brew, growing wings, the mermaid's time…) in one column ABOVE the minimap, as wide as it is (the author 20.11:
// «полосы варки зелий, выращивания крыльев… то наслаиваются на низ, то на верх, мешают: пусть всегда будут над мини-картой, по её размеру»).
// The column follows the minimap's size (Hud.setMinimapSize sets --minimap-h / --minimap-w); a bar is a child of it — shown or hidden by its own display, the stack puts the shown ones one over another.
export function statusStack() {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('status-stack');
    if (!el) { el = document.createElement('div'); el.id = 'status-stack'; document.body.appendChild(el); }
    return el;
}
/** Put a bar's element into the column (or the page, when there is no document). */
export function placeStatusBar(el) { const s = statusStack(); (s || document.body).appendChild(el); return el; }
