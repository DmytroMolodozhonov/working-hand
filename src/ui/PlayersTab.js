/**
 * PlayersTab.js — Escape → «👥 Игроки». The only place where the list of players lives (in the live game nothing of it is drawn:
 * the list used to cover the coins counter). One row per player: a dot in his colour, the name, host / guest, the link, «заходит…»
 * while he is still on the loading screen, and the voice marks (слышу / не слышу, говорит сейчас).
 * The pure part (`playerRows`) is node-testable; the DOM part refreshes twice a second, only while the tab is open.
 */

import { PLAYER_COLORS } from '../net/PlayerPresence.js';
import { MODE_TITLE } from '../net/VoiceChatRules.js';

const hex = (c) => '#' + (Number.isFinite(c) ? c : 0x3498db).toString(16).padStart(6, '0');

/** How the link with a player looks from the packets that came (no real ping in the protocol: the age of the last packet). */
export function linkOf(stats) {
    if (!stats) return { text: '—', cls: 'dim' };
    if (stats.age > 5000) return { text: 'нет связи', cls: 'bad' };
    if (stats.age > 1200 || stats.maxGap > 1500) return { text: `слабая (${Math.round(Math.max(stats.age, stats.maxGap))} мс)`, cls: 'warn' };
    return { text: `хорошая (${Math.round(Math.max(stats.age, 1))} мс)`, cls: 'ok' };
}

/** @returns {{rows: object[], voice: string|null}} */
export function playerRows(game) {
    const net = game?.net, sync = game?.sync;
    if (!net?.active || !sync) return { rows: [], voice: null };
    const vcs = game.voiceChat?.status?.() || null;
    const talk = vcs && (vcs.mode === 'world' || vcs.mode === 'radius');
    const peers = new Map((vcs?.peers || []).map((p) => [p.id, p]));
    const rows = [];
    const meInfo = net.players.get(net.localId);
    const vs = game.hud?.voiceState;
    rows.push({
        id: net.localId, me: true, name: net.name, color: PLAYER_COLORS[(meInfo?.color ?? 0) % PLAYER_COLORS.length],
        role: net.isHost ? 'хост' : 'гость', link: net.isHost ? null : linkOf({ age: performance.now() - (net.lastSeen?.get('H') || performance.now()), maxGap: 0 }), loading: false,
        voice: talk ? { kind: 'me', speaking: !!(vs && (vs.ptt ? vs.down : vs.me)), mic: vcs.mic } : null,
    });
    for (const e of sync.presence.rows()) {
        const r = game.remotes.get(e.id);
        const p = peers.get(e.id);
        rows.push({
            id: e.id, me: false, name: e.name, color: r?.color ?? PLAYER_COLORS[(e.color ?? 0) % PLAYER_COLORS.length],
            role: e.id === 'H' ? 'хост' : 'гость', link: r ? linkOf(r.netStats?.()) : null, loading: e.loading,
            voice: talk && p ? { kind: 'peer', hears: !!p.heard, speaking: !!p.speaking, why: p.why } : talk ? { kind: 'peer', hears: false, speaking: false, why: 'соединяемся' } : null,
        });
    }
    const voice = vcs ? (MODE_TITLE[vcs.mode] || vcs.mode) : null;
    return { rows, voice };
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function playersHtml({ rows, voice }) {
    if (!rows.length) return '<div class="pl-empty">Вы играете один.</div>';
    const out = [];
    if (voice) out.push(`<div class="pl-voice">🎙 Голосовой чат: ${esc(voice)}</div>`);
    for (const r of rows) {
        let v = '';
        if (r.voice?.kind === 'me') v = ['denied', 'busy', 'absent'].includes(r.voice.mic) ? '<span class="pl-v bad" title="Микрофон не работает">🎙✖</span>' : `<span class="pl-v ${r.voice.speaking ? 'talk' : 'dim'}" title="${r.voice.speaking ? 'Вас слышат' : 'Вы молчите'}">🎙</span>`;
        else if (r.voice?.kind === 'peer') v = `<span class="pl-v ${r.voice.hears ? 'ok' : 'bad'}" title="${r.voice.hears ? 'Вы его слышите' : 'Вы его не слышите' + (r.voice.why ? ': ' + esc(r.voice.why) : '')}">${r.voice.hears ? '🔊' : '🔇'}</span>${r.voice.speaking ? '<span class="pl-v talk" title="Говорит сейчас">🗣</span>' : ''}`;
        const state = r.loading ? '<span class="pl-state warn">заходит…</span>' : r.link ? `<span class="pl-state ${r.link.cls}">${esc(r.link.text)}</span>` : '';
        out.push(`<div class="pl-row${r.loading ? ' loading' : ''}${r.me ? ' me' : ''}"><i style="background:${hex(r.color)}"></i><span class="pl-name">${esc(r.name)}${r.me ? ' (вы)' : ''}</span><span class="pl-role">${r.role}</span>${state}<span class="pl-voice-marks">${v}</span></div>`);
    }
    return out.join('');
}

export class PlayersTabView {
    constructor(pane, getGame) { this.pane = pane; this.getGame = getGame; this._t = null; this._last = ''; }
    show() { this.refresh(); clearInterval(this._t); this._t = setInterval(() => this.refresh(), 500); }
    hide() { clearInterval(this._t); this._t = null; }
    refresh() {
        const html = playersHtml(playerRows(this.getGame()));
        if (html !== this._last) { this._last = html; this.pane.innerHTML = html; }
    }
}
