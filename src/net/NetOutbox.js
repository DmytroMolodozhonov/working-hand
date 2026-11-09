/** A slow reliable channel must not collect seconds of obsolete poses ahead of a spell. */
export const OUTBOX = { HIGH: 16384, STATE: 4096, POLL: 25, MAX_EVENTS: 4096, BUDGET_MS: 2 };
const SNAPSHOTS = new Set(['p', 'pstate', 'z', 'w', 'vil', 'an', 'ipos', 'bmv']);
const stateKey = msg => msg.t + ':' + (msg.from || msg.id || '') + (msg.t === 'bmv' ? ':' + msg.id : '');
const ITEM_EVENTS = new Set(['igone', 'inew']);
const WEAPON_EVENTS = new Set(['wgone', 'wnew', 'wspawn', 'grant', 'drop']);

export class NetOutbox {
    constructor(conn, report = null) {
        this.conn = conn;
        this.events = [];
        this.states = new Map();
        this.timer = null;
        this.pumping = false;
        this.report = report;
        this.pressureAt = -Infinity;
    }

    push(msg, packets) {
        if (msg.t === 'prespawn' || msg.t === 'pdead') {
            this.states.delete('p:' + (msg.from || msg.by || ''));
            this.states.delete('pstate:' + (msg.from || ''));
        }
        // Complete snapshots replace each other; weapon deltas are merged by ID. Edits, hits and casts never replace events.
        if (msg.t === 'zhit' || msg.t === 'zsand') {
            const key = 'z:' + (msg.from || ''), pending = this.states.get(key);
            if (pending) { this.events.push({ packets: pending.packets, i: 0 }); this.states.delete(key); }
        }
        if (WEAPON_EVENTS.has(msg.t)) {
            const key = 'w:' + (msg.from || ''), pending = this.states.get(key);
            if (pending) { this.events.push({ packets: pending.packets, i: 0 }); this.states.delete(key); }
        }
        if (ITEM_EVENTS.has(msg.t)) this.flushState('ipos:' + (msg.from || ''));
        if (msg.t === 'vhit') this.flushState('vil:' + (msg.from || ''));
        if (msg.t === 'ahit') this.flushState('an:' + (msg.from || ''));
        if (SNAPSHOTS.has(msg.t)) this.states.set(stateKey(msg), { msg, packets });
        else {
            if (this.events.length >= OUTBOX.MAX_EVENTS) { this.report?.('связь не успевает передавать игровые действия — соединение закрыто'); this.conn.close(); this.dispose(); return; }
            this.events.push({ packets, i: 0 });
        }
        this.pump();
    }

    flushState(key) {
        const pending = this.states.get(key);
        if (pending) { this.events.push({ packets: pending.packets, i: 0 }); this.states.delete(key); }
    }

    buffered() {
        return this.conn.dataChannel?.bufferedAmount || this.conn._dc?.bufferedAmount || 0;
    }

    pump() {
        if (this.pumping) return;
        this.pumping = true;
        try {
            if (!this.conn.open) { this.dispose(); return; }
            if (this.buffered() >= OUTBOX.HIGH && performance.now() - this.pressureAt > 30000) {
                this.pressureAt = performance.now();
                this.report?.(`перегрузка канала: ${Math.round(this.buffered() / 1024)} КБ в передаче, действий ждёт ${this.events.length}; устаревшие позы заменяются свежими`);
            }
            const until = performance.now() + OUTBOX.BUDGET_MS;
            while (performance.now() < until && this.buffered() < OUTBOX.HIGH && !(this.conn.bufferSize > 0)) {
                const task = this.events[0];
                if (task) {
                    this.conn.send(task.packets[task.i]);
                    task.i++;
                    if (task.i === task.packets.length) this.events.shift();
                    continue;
                }
                if (this.buffered() >= OUTBOX.STATE || !this.states.size) break;
                const [key, state] = this.states.entries().next().value, packets = state.packets;
                // Snapshots are small; large world/snapshot messages still retain their complete piece sequence.
                if (packets.length > 1) { this.states.delete(key); this.events.push({ packets, i: 0 }); continue; }
                this.conn.send(packets[0]);
                this.states.delete(key);
            }
        } catch (_) { /* a temporarily full PeerJS buffer: retain the event for the next pump */ }
        finally { this.pumping = false; }
        if ((this.events.length || this.states.size) && !this.timer && this.conn.open) {
            this.timer = setTimeout(() => { this.timer = null; this.pump(); }, OUTBOX.POLL);
            this.timer.unref?.();
        }
    }

    mergeState(msg) {
        if (msg.t === 'w' || msg.t === 'ipos') {
            const previous = this.states.get(msg.t + ':' + (msg.from || ''))?.msg;
            if (!previous) return msg;
            // Weapons send deltas: a weapon that fell asleep is sent once, and must survive subsequent moving updates.
            const rows = new Map((previous.l || []).map(row => [row[0], row]));
            for (const row of msg.l || []) rows.set(row[0], row);
            return { ...msg, l: [...rows.values()] };
        }
        if (msg.t !== 'z') return msg;
        const previous = this.states.get('z:' + (msg.from || ''))?.msg;
        if (!previous?.rm?.length) return msg;
        // Zombie positions are a full snapshot, but deletions are a delta: retain every deletion while replacing poses.
        const removed = new Set([...(previous.rm || []), ...(msg.rm || [])]);
        for (const row of msg.l || []) removed.delete(row[0]);
        return { ...msg, rm: [...removed] };
    }

    dispose() {
        clearTimeout(this.timer); this.timer = null;
        this.events.length = 0; this.states.clear();
    }
}
