import { SPEC } from './block-catalog';
import type { BotConfig, Node, Strategy, Tick, Status } from './bot-model';

export const PATTERN_STAGES = ['Waiting for pair', 'Waiting for confirmation', 'Setup detected', 'Evaluation pending', 'Cooldown', 'Data interrupted'] as const;
export type PatternStage = typeof PATTERN_STAGES[number];
export type Parity = 'Even' | 'Odd' | 'Either';
export interface PatternProgram {
    blockId: string; name: string; version: string;
    kind: 'pair' | 'identical' | 'parity' | 'transitions'; pairs: number[]; length: number;
    initial: Parity; transitions: string[]; confirmation: number | Parity;
    intervening: boolean; timeout: number; cooldown: number; cooldownSeconds: number; minimum: number;
    strategy: Strategy; digit: number; barrier: number;
}
export interface PatternRecord {
    id: string; program: PatternProgram; market: string; pair: Tick[]; pairIndex: number;
    confirmation: Tick | null; intervening: Tick[]; setupTime: number | null;
    evaluation: Tick | null; result: Status | null; reason: string;
    lifecycle: 'pending' | 'completed' | 'invalidated'; interruptions: string[]; deduplicated: number;
}
export function isDetector(node: Node) { return SPEC.get(node.type)?.op.startsWith('pattern_detect_') ?? false; }
export function patternSequence(detector: Node, nodes: Node[]): Node[] {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const chain: Node[] = []; const seen = new Set<string>(); let node: Node | undefined = detector;
    while (node && !seen.has(node.id)) { seen.add(node.id); chain.push(node); node = node.next ? byId.get(node.next) : undefined; }
    return chain;
}
/** Compile connected declarations, never generated JavaScript. Disconnected blocks cannot change a program. */
export function compilePattern(detector: Node, config: BotConfig): PatternProgram {
    const op = SPEC.get(detector.type)!.op; const f = detector.fields;
    const p: PatternProgram = {
        blockId: detector.id, name: SPEC.get(detector.type)!.label, version: '',
        kind: op === 'pattern_detect_pair' ? 'pair' : op === 'pattern_detect_identical' ? 'identical' : op === 'pattern_detect_transitions' ? 'transitions' : 'parity',
        pairs: String(f.PAIRS ?? '00 / 11').split(' / ').map(v => Number(v[0])), length: Number(f.N ?? 2),
        initial: (op === 'pattern_detect_even' ? 'Even' : op === 'pattern_detect_odd' ? 'Odd' : f.INITIAL ?? 'Even') as Parity,
        transitions: String(f.PARITIES ?? 'Even,Odd,Even').split(',').map(s => s.trim()),
        confirmation: (f.CONFIRM ?? 0) as number | Parity, intervening: true, timeout: Number(f.TIMEOUT ?? 0),
        cooldown: Number(f.COOLDOWN ?? config.cooldownTicks), cooldownSeconds: config.cooldownSeconds, minimum: Number(f.MINIMUM ?? config.minSamples),
        strategy: f.TARGET === 'Odd' ? 'odd' : f.TARGET === 'Even' ? 'even' : config.strategy, digit: config.digit, barrier: config.barrier,
    };
    for (const node of patternSequence(detector, config.nodes).slice(1)) {
        const action = SPEC.get(node.type)!.op; const v = node.fields;
        if (action === 'pattern_confirm_digit') p.confirmation = Number(v.DIGIT);
        if (action === 'pattern_confirm_even') p.confirmation = 'Even';
        if (action === 'pattern_confirm_odd') p.confirmation = 'Odd';
        if (action === 'pattern_confirm_parity') p.confirmation = v.PARITY as Parity;
        if (action === 'pattern_intervening') p.intervening = v.ALLOW === 'Yes';
        if (action === 'pattern_timeout') p.timeout = Number(v.N);
        if (action === 'pattern_barrier') { p.strategy = v.RULE === 'Over 1' ? 'over' : 'under'; p.barrier = v.RULE === 'Over 1' ? 1 : 8; }
        if (action === 'pattern_parity_outcome') p.strategy = v.PARITY === 'Even' ? 'even' : 'odd';
        if (action === 'pattern_cooldown') p.cooldown = Number(v.N);
        if (action === 'pattern_minimum') p.minimum = Number(v.N);
    }
    p.name = p.kind === 'pair' ? `${p.pairs.map(d => `${d}${d}`).join(' / ')} → ${p.confirmation} → ${p.strategy} ${p.barrier}` : p.kind === 'identical' ? `${p.length} identical → ${p.confirmation} → ${p.strategy}` : p.kind === 'transitions' ? `${p.transitions.join(' → ')} → ${p.confirmation} → ${p.strategy}` : `${p.length} ${p.initial} → ${p.confirmation} → ${p.strategy}`;
    // Stable configuration fingerprint for research records and restart deduplication.
    const serialized = JSON.stringify({ ...p, blockId: '', version: '' }); let hash = 2166136261;
    for (const char of serialized) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    p.version = (hash >>> 0).toString(16);
    return p;
}
export const parityMatches = (digit: number, parity: Parity) => parity === 'Either' || digit % 2 === (parity === 'Even' ? 0 : 1);
