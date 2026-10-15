import { outcome, type Tick, type Status } from './bot-model';
import { parityMatches, type PatternProgram, type PatternRecord, type PatternStage } from './pattern-program';
export interface PatternEvent { record: PatternRecord; label: string; status: Status; reason: string }
/** Shared chronological state machine used by live monitoring, replay, and strategy comparison. */
export class PatternEngine {
    stage: PatternStage = 'Waiting for pair';
    reason = 'Waiting for adjacent genuine ticks.';
    records: PatternRecord[] = [];
    latest: PatternRecord | null = null;
    private recent: Tick[] = [];
    private index = 0;
    private cooldownUntil = 0;
    private cooldownUntilTime = 0;
    private now = 0;
    private setupVisibleAt = 0;
    private seen = new Set<string>();
    private consumed = new Set<string>();
    private replayThrough = new Map<string, number>();
    get pending() { return this.records.filter(r => r.lifecycle === 'pending'); }
    get cooldownSeconds() { return Math.max(0,Math.ceil((this.cooldownUntilTime-this.now)/1000)); }
    get cooldown() { return Math.max(0, this.cooldownUntil - this.index); }
    private change(stage: PatternStage, reason: string) { this.stage = stage; this.reason = reason; }
    synchronised() {if(this.stage==='Data interrupted')this.change('Waiting for pair','Genuine history synchronised. Waiting for a new adjacent run.');}
    advanceStage(now: number) {
        this.now=now;
        if (this.stage === 'Setup detected' && now - this.setupVisibleAt >= 750) this.change('Evaluation pending', 'Setup recorded. Awaiting the next genuine tick, not the confirmation tick.');
    }
    restore(records: PatternRecord[]) {
        this.records = records;
        for (const r of records) {
            this.consumed.add(r.id);
            const ticks=[...r.pair,...r.intervening,...(r.confirmation?[r.confirmation]:[]),...(r.evaluation?[r.evaluation]:[])];
            const key=`${r.program.version}:${r.market}`;
            this.replayThrough.set(key,Math.max(this.replayThrough.get(key)??0,...ticks.map(t=>t.epoch)));
        }
        this.latest = records[records.length-1] ?? null;
    }
    interrupt(reason: string) {
        for (const r of this.pending) { r.lifecycle = 'invalidated'; r.result = 'Inconclusive'; r.reason = reason; r.interruptions.push(reason); }
        this.recent = []; this.change('Data interrupted', reason);
    }
    reset(reason = 'New pattern cycle; completed records preserved.') {
        this.interrupt(reason); this.cooldownUntil = 0; this.cooldownUntilTime = 0; this.change('Waiting for pair', reason);
    }
    allowNext() { this.cooldownUntil = 0; this.cooldownUntilTime = 0; this.reason = 'Cooldown released. Pending instances still prevent duplicates.'; }
    startCooldown(ticks: number) { this.cooldownUntil = this.index + ticks; this.change(ticks ? 'Cooldown' : 'Waiting for pair', `${ticks} genuine ticks of cooldown configured.`); }
    process(p: PatternProgram, tick: Tick, sampleSize: number, overlap: boolean, limit: number, now = tick.epoch * 1000): PatternEvent[] {
        this.now=now;
        const events: PatternEvent[] = [];
        const emit = (r: PatternRecord, label: string, status: Status, reason: string) => { r.reason = reason; this.latest = r; events.push({ record: r, label, status, reason }); };
        if(tick.epoch <= (this.replayThrough.get(`${p.version}:${tick.symbol}`)??-Infinity)) {this.reason='Previously observed ticks skipped after restart; completed patterns cannot be evaluated again.';return events;}
        const seenKey = `${p.version}:${tick.key}`;
        if (this.seen.has(seenKey)) {
            for (const r of this.records.filter(r => r.confirmation?.key === tick.key)) r.deduplicated++;
            return events;
        }
        this.seen.add(seenKey); if (this.seen.size > 10000) this.seen.delete(this.seen.values().next().value!);
        if (this.recent.length && this.recent[this.recent.length-1]!.symbol !== tick.symbol) this.interrupt('Market changed: a sequence cannot span instruments.');
        this.index++;
        this.recent.push(tick); this.recent = this.recent.slice(-1000);
        let consumedThisTick = false;
        for (const r of this.pending.filter(r => r.program.blockId === p.blockId)) {
            if (r.market !== tick.symbol) { this.interrupt('Market changed before evaluation.'); break; }
            if (r.confirmation) {
                if (tick.key === r.confirmation.key) continue;
                this.change('Evaluation pending', 'Evaluating the first subsequent genuine tick.');
                r.evaluation = { ...tick }; r.lifecycle = 'completed';
                r.result = outcome(r.program.strategy, tick.digit, r.program.digit, r.program.barrier) ? 'Pass' : 'Fail';
                const condition = ['even', 'odd'].includes(r.program.strategy) ? r.program.strategy : `${r.program.strategy} ${r.program.strategy === 'matches' || r.program.strategy === 'differs' ? r.program.digit : r.program.barrier}`;
                emit(r, 'Observed outcome', r.result, `Next genuine digit ${tick.digit}: ${condition} ${r.result === 'Pass' ? 'passes' : 'fails'}. Confirmation digit ${r.confirmation.digit} was not evaluated. Over/Under comparisons are strict.`);
                this.cooldownUntil = this.index + r.program.cooldown;this.cooldownUntilTime=now+(r.program.cooldownSeconds??0)*1000; consumedThisTick = true;
                continue;
            }
            const elapsed = this.index - r.pairIndex;
            if (r.program.timeout > 0 && elapsed > r.program.timeout) {
                r.lifecycle = 'invalidated'; r.result = 'Inconclusive';
                emit(r, 'Confirmation timeout', 'Inconclusive', `No confirmation in ${r.program.timeout} subsequent ticks. Pattern expired.`); consumedThisTick = true; continue;
            }
            const matches = typeof r.program.confirmation === 'number' ? tick.digit === r.program.confirmation : parityMatches(tick.digit, r.program.confirmation);
            if (elapsed > 0 && matches) {
                r.confirmation = { ...tick }; r.setupTime = tick.epoch * 1000;
                this.setupVisibleAt = now; this.change('Setup detected', `Confirmation ${tick.digit} occurred strictly after the run. The next genuine tick will be evaluated.`);
                emit(r, 'Setup detected', 'Pass', this.reason); consumedThisTick = true;
            } else if (!r.program.intervening) {
                r.lifecycle = 'invalidated'; r.result = 'Inconclusive';
                emit(r, 'Setup rejected', 'Fail', `Digit ${tick.digit} did not confirm; intervening digits are disabled.`); consumedThisTick = true;
            } else {
                r.intervening.push({ ...tick });
                this.change('Waiting for confirmation', `Digit ${tick.digit} is allowed. Waiting for ${r.program.confirmation}; ${r.intervening.length} intervening ticks; timeout ${r.program.timeout || 'unlimited'}.`);
            }
        }
        const pending = this.pending.filter(r => r.program.blockId === p.blockId);
        if (!overlap && (pending.length || consumedThisTick)) { this.setRestingStage(); return events; }
        if (this.cooldown||this.cooldownSeconds) { this.change('Cooldown', `${this.cooldown} genuine ticks / ${this.cooldownSeconds}s of cooldown remain.`); return events; }
        if (this.records.filter(r=>r.confirmation).length >= limit || this.records.length>=500) { this.reason = `Maximum ${limit} setups or 500 recorded attempts reached; no new instances.`; return events; }
        if (sampleSize < p.minimum) { this.reason = `Inconclusive: ${sampleSize}/${p.minimum} historical ticks required. No setup created.`; return events; }
        const length = p.kind === 'pair' ? 2 : p.kind === 'transitions' ? p.transitions.length : p.length;
        const run = this.recent.slice(-length);
        if (run.length < length) { this.reason = `Waiting for ${length} adjacent genuine ticks after this session boundary.`; return events; }
        const qualifies = p.kind === 'pair' ? run[0].digit === run[1].digit && p.pairs.includes(run[0].digit)
            : p.kind === 'identical' ? run.every(t => t.digit === run[0].digit)
            : p.kind === 'parity' ? run.every(t => parityMatches(t.digit, p.initial))
            : run.every((t, i) => parityMatches(t.digit, p.transitions[i] as 'Even' | 'Odd'));
        if (!qualifies) { this.setRestingStage(); if (!this.pending.length) this.reason = `Latest adjacent digits ${run.map(t => t.digit).join(' → ')} do not match ${p.name}.`; return events; }
        const id = `${tick.symbol}:${p.version}:${run[0].key}:${tick.key}`;
        if (this.consumed.has(id)) { this.reason = 'Duplicate pair instance prevented; completed observations are never re-evaluated.'; return events; }
        this.consumed.add(id);
        const record: PatternRecord = { id, program: { ...p }, market: tick.symbol, pair: run.map(t => ({ ...t })), pairIndex: this.index, confirmation: null, intervening: [], setupTime: null, evaluation: null, result: null, reason: '', lifecycle: 'pending', interruptions: [], deduplicated: 0 };
        this.records.push(record); this.latest = record;
        this.change('Waiting for confirmation', `Adjacent ${run.map(t => t.digit).join(' → ')} detected. Waiting for a later ${p.confirmation}; intervening digits ${p.intervening ? 'allowed' : 'disabled'}; timeout ${p.timeout || 'unlimited'}.`);
        emit(record, 'Qualifying run detected', 'Pass', this.reason);
        return events;
    }
    private setRestingStage() {
        if (this.pending.some(r => r.confirmation)) {
            if (this.stage !== 'Setup detected') this.change('Evaluation pending', this.reason);
        } else if (this.pending.length) this.change('Waiting for confirmation', this.reason);
        else if (this.cooldown||this.cooldownSeconds) this.change('Cooldown', this.reason);
        else this.change('Waiting for pair', this.latest?.reason ?? this.reason);
    }
}
