import type { PatternRecord } from './pattern-program';
export type Status = 'Pass' | 'Fail' | 'Inconclusive';
export type Strategy = 'matches' | 'differs' | 'over' | 'under' | 'even' | 'odd';
export type BotState = 'Stopped' | 'Initialising' | 'Analysing' | 'Waiting For Entry Conditions' | 'Setup Detected' | 'Evaluation Pending' | 'Cooldown' | 'Paused' | 'Data Interrupted' | 'Resynchronising' | 'Completed' | 'Error';
export type Value = number | string | boolean | number[] | null;
export interface Result { status: Status; value: Value; reason: string }
export interface Node { id: string; type: string; fields: Record<string, string | number>; inputs: Record<string, string>; next?: string; x?: number; y?: number }
export interface BotConfig {
    version: 1; id: string; name: string; description: string; symbol: string;
    group: 'Volatility Indices' | '1-Second Volatility Indices'; strategy: Strategy;
    digit: number; barrier: number; window: number; minSamples: number; threshold: number;
    stabilityWindows: number; tolerance: number; cooldownTicks: number; cooldownSeconds: number;
    observeTicks: number; consecutivePasses: number; maxSetups: number; freshnessSeconds: number;
    repeated: boolean; allowOverlap: boolean; pendingOnStop: 'cancel' | 'invalidate' | 'preserve';
    nodes: Node[];
}
export interface Tick { key: string; epoch: number; digit: number; price: string; symbol: string }
export interface Trace { id: number; time: number; blockId: string; label: string; status: Status; reason: string; value: Value; digit: number | null; state: BotState; market: string }
export interface Observation {
    id: string; time: number; tickKey: string; market: string; mode: 'live' | 'replay';
    config: Omit<BotConfig, 'nodes'>; frequencies: number[]; conditions: Trace[];
    status: 'Pending' | 'Qualified' | 'Not qualified' | 'Inconclusive' | 'Cancelled';
    reason: string; subsequent: Tick[]; requiredTicks: number; pattern?: PatternRecord;
}
export const STATES: BotState[] = ['Stopped', 'Initialising', 'Analysing', 'Waiting For Entry Conditions', 'Setup Detected', 'Evaluation Pending', 'Cooldown', 'Paused', 'Data Interrupted', 'Resynchronising', 'Completed', 'Error'];
export const STRATEGIES: Strategy[] = ['matches', 'differs', 'over', 'under', 'even', 'odd'];
export const WINDOWS = [25, 50, 100, 250, 500, 1000];
export function defaultConfig(): BotConfig {
    return { version: 1, id: crypto.randomUUID(), name: 'My digit observer', description: '', symbol: '', group: 'Volatility Indices', strategy: 'matches', digit: 2, barrier: 2, window: 100, minSamples: 100, threshold: 15, stabilityWindows: 2, tolerance: 5, cooldownTicks: 5, cooldownSeconds: 0, observeTicks: 1, consecutivePasses: 1, maxSetups: 100, freshnessSeconds: 15, repeated: false, allowOverlap: false, pendingOnStop: 'invalidate', nodes: [] };
}
export const result = (status: Status, reason: string, value: Value = status === 'Pass'): Result => ({ status, reason, value });
export function compound(op: string, values: Result[]): Result {
    const statuses = values.map(v => v.status);
    if (op === 'not') return result(statuses[0] === 'Inconclusive' ? 'Inconclusive' : statuses[0] === 'Pass' ? 'Fail' : 'Pass', `NOT: ${statuses[0]}`);
    const status = op === 'or'
        ? statuses.includes('Pass') ? 'Pass' : statuses.includes('Inconclusive') ? 'Inconclusive' : 'Fail'
        : statuses.includes('Fail') ? 'Fail' : statuses.includes('Inconclusive') ? 'Inconclusive' : 'Pass';
    return result(status, `${op.toUpperCase()}: ${statuses.join(', ')}`);
}
export function outcome(strategy: Strategy, digit: number, selected: number, barrier: number): boolean {
    switch (strategy) {
        case 'matches': return digit === selected;
        case 'differs': return digit !== selected;
        case 'over': return digit > barrier;
        case 'under': return digit < barrier;
        case 'even': return digit % 2 === 0;
        case 'odd': return digit % 2 === 1;
    }
}
export const frequency = (digits: number[], selected: number[]) => digits.length ? digits.filter(d => selected.includes(d)).length / digits.length * 100 : NaN;
export const ALL_DIGITS = Array.from({ length: 10 }, (_, i) => i);
