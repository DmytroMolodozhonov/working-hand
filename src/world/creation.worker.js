/**
 * creation.worker.js — the blocks of a building made by «Да пусть создастся …» (CreationBuild.creationPlan: a city is
 * ~0.2–0.6 s of work — never in a frame of the game). In: {id, o}; out: {id, plan} (its arrays moved, not copied).
 */
import { creationPlan } from './CreationBuild.js';

self.onmessage = (e) => {
    const { id, o } = e.data || {};
    try {
        const plan = creationPlan(o);
        self.postMessage({ id, plan }, [plan.cells.buffer, plan.fill.buffer, plan.paths.buffer]);
    } catch (err) {
        self.postMessage({ id, error: String(err?.message || err) });
    }
};
