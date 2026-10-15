import { ALL_DIGITS, frequency, result, type BotConfig, type Node, type Result, type Tick, type Strategy } from './bot-model';
import { PatternEngine } from './pattern-engine';
import { compilePattern, isDetector, type PatternProgram } from './pattern-program';
export function transitionCounts(digits: number[], from: number, to: number, epochs?: number[], cadence=Infinity) {
    let hits = 0, total = 0;
    for (let i = 0; i + 1 < digits.length; i++) if (digits[i] === from && (!epochs || epochs[i+1]-epochs[i]<=cadence)) { total++; if (digits[i + 1] === to) hits++; }
    return { hits, total, frequency: total ? hits / total * 100 : NaN };
}
export function streakLengths(digits: number[]) {
    let current = digits.length ? 1 : 0, longest = current, run = current;
    for (let i = 1; i < digits.length; i++) { run = digits[i] === digits[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
    if (digits.length) { current = 1; while (current < digits.length && digits[digits.length - current - 1] === digits[digits.length-1]) current++; }
    return { current, longest };
}
export function advancedValue(op: string, node: Node, history: Tick[], config: BotConfig, engine: PatternEngine): Result | undefined {
    if (!op.startsWith('adv_') || op === 'adv_window') return undefined;
    const f = node.fields, n = Number(f.N), digit = Number(f.DIGIT), to = Number(f.TO);
    const sample=history.slice(-config.window), cadence=config.group==='1-Second Volatility Indices'?1:2;
    const epochs=sample.map(t=>t.epoch);
    const ds = sample.map(t => t.digit), latest = ds[ds.length-1], previous = ds[ds.length-2];
    const num = (value: number, reason: string) => Number.isFinite(value) ? result('Pass', reason, value) : result('Inconclusive', reason, null);
    const bool = (value: boolean, reason: string) => result(value ? 'Pass' : 'Fail', reason);
    if (op === 'adv_stage') return result('Pass', engine.reason, engine.stage);
    if (op === 'adv_state') return bool(engine.stage === f.STAGE, `Current stage: ${engine.stage}. Required: ${f.STAGE}.`);
    if (op === 'adv_confirmation_after') return engine.latest?.confirmation ? bool(engine.latest.confirmation.key !== engine.latest.pair[engine.latest.pair.length-1]!.key, 'Confirmation is strictly after the qualifying adjacent run.') : result('Inconclusive', 'No confirmation recorded yet.', null);
    if (latest === undefined) return result('Inconclusive', 'No genuine ticks available.', null);
    if (op === 'adv_parity') return result('Pass', `Final digit ${latest}.`, latest % 2 ? 'Odd' : 'Even');
    let suffix=sample.length-1;while(suffix>0&&sample[suffix].epoch-sample[suffix-1].epoch<=cadence)suffix--;
    let longest=0,segment:number[]=[];for(let i=0;i<sample.length;i++){if(i&&sample[i].epoch-sample[i-1].epoch>cadence){longest=Math.max(longest,streakLengths(segment).longest);segment=[];}segment.push(sample[i].digit);}
    const streak={current:streakLengths(ds.slice(suffix)).current,longest:Math.max(longest,streakLengths(segment).longest)};
    if (op === 'adv_streak' || op === 'adv_longest') return num(op === 'adv_streak' ? streak.current : streak.longest, `Equal-digit streak in ${ds.length} available ticks.`);
    if (op === 'adv_streak_minimum') return bool(streak.current >= n, `Current equal-digit streak ${streak.current}; requires ${n}.`);
    if (['adv_streak_ended', 'adv_parity_switched', 'adv_repeated', 'adv_transition_now', 'adv_parity_transition'].includes(op)) {
        if (previous === undefined || sample[sample.length-1].epoch-sample[sample.length-2].epoch>cadence || op === 'adv_streak_ended' && ds.length < 3) return result('Inconclusive', 'Insufficient adjacent ticks.', null);
        const passes = op === 'adv_streak_ended' ? ds[ds.length-3] === previous && latest !== previous : op === 'adv_parity_switched' ? previous % 2 !== latest % 2 : op === 'adv_repeated' ? previous === latest : op === 'adv_transition_now' ? previous === digit && latest === to : previous % 2 === (f.FROM === 'Even' ? 0 : 1) && latest % 2 === (f.TO_PARITY === 'Even' ? 0 : 1);
        return bool(passes, `Chronological adjacent transition ${previous} → ${latest}; A occurs before B.`);
    }
    if (op.includes('transition')) {
        const counts = transitionCounts(ds, digit, to,epochs,cadence);
        const explanation = `${counts.hits}/${counts.total} observed ${digit} → ${to} transitions (A first, B on the next genuine tick).`;
        if (op === 'adv_transition_count') return num(counts.hits, explanation);
        if (op === 'adv_transition_sample') return result(counts.total >= n ? 'Pass' : 'Inconclusive', `${counts.total}/${n} observed outgoing transitions from ${digit}.`, counts.total);
        const minimum = Number(f.MINIMUM);
        if (op === 'adv_transition_windows') {
            if (history.length < n * 2) return result('Inconclusive', `Requires ${n * 2} ticks in two non-overlapping windows.`, null);
            const allTicks=history.slice(-n*2), all=allTicks.map(t=>t.digit), times=allTicks.map(t=>t.epoch), a = transitionCounts(all.slice(0, n), digit, to,times.slice(0,n),cadence), b = transitionCounts(all.slice(n), digit, to,times.slice(n),cadence);
            if (a.total < minimum || b.total < minimum) return result('Inconclusive', `Transition samples ${a.total} / ${b.total}; requires ${minimum} in each window.`, null);
            return num(b.frequency - a.frequency, `Older ${a.hits}/${a.total}; newer ${b.hits}/${b.total}. Newer minus older percentage points.`);
        }
        return counts.total < minimum ? result('Inconclusive', `${explanation} Minimum ${minimum} observations required.`, null) : num(counts.frequency, explanation);
    }
    if (op === 'adv_frequency_windows' || op === 'adv_stability') {
        if (history.length < 2 * n) return result('Inconclusive', `Needs ${2 * n} ticks in complete disjoint windows; ${history.length} available.`, null);
        const all = history.slice(-2 * n).map(t => t.digit), a = frequency(all.slice(0, n), [digit]), b = frequency(all.slice(n), [digit]);
        const reason = `Older ${a.toFixed(2)}% / newer ${b.toFixed(2)}%, ${n} ticks each; change ${(b - a).toFixed(2)} percentage points.`;
        return op === 'adv_frequency_windows' ? num(b - a, reason) : bool(Math.abs(b - a) <= Number(f.TOLERANCE), reason);
    }
    if (ds.length < config.minSamples) return result('Inconclusive', `Sample ${ds.length}; requires ${config.minSamples}.`, null);
    if (op === 'adv_count') return num(ds.filter(d => d === digit).length, `${ds.length} genuine ticks sampled.`);
    if (op === 'adv_frequency') return num(frequency(ds, [digit]), `${digit} in ${ds.length} genuine ticks.`);
    if (op === 'adv_combined') return num(frequency(ds, String(f.DIGITS).split(',').map(Number)), `Combined share of ${ds.length} genuine ticks.`);
    if (op === 'adv_most' || op === 'adv_least') {
        const ranked = ALL_DIGITS.slice().sort((a, b) => (frequency(ds, [a]) - frequency(ds, [b])) * (op === 'adv_most' ? -1 : 1) || a - b);
        return num(ranked[0], `Observed ${op === 'adv_most' ? 'most' : 'least'} frequent digit; ties choose the lowest digit. Sample ${ds.length}. Not a prediction.`);
    }
    if (op === 'adv_parity_frequency') { const pct = frequency(ds, f.PARITY === 'Even' ? [0, 2, 4, 6, 8] : [1, 3, 5, 7, 9]); return bool(pct >= Number(f.PERCENT), `${f.PARITY}: ${pct.toFixed(2)}% of ${ds.length}; threshold ${f.PERCENT}%.`); }
    return result('Inconclusive', 'No value available for this block.', null);
}
export interface StrategyComparison { name: string; strategy: Strategy; setups: number; completed: number; passes: number; frequency: number | null; meanDelay: number | null; windows: { completed: number; frequency: number | null }[]; stability: number | null; score: number | null; reason: string }
function wilsonLower(passes: number, total: number) { const z = 1.96, p = passes / total; return (p + z * z / (2 * total) - z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / (1 + z * z / total); }
export function compareStrategies(history: Tick[], config: BotConfig, minimum = 10, window = Math.floor(history.length / 2), candidateDigit = config.digit): StrategyComparison[] {
    const detector = config.nodes.find(isDetector);
    const base: PatternProgram = detector ? compilePattern(detector, config) : { blockId: 'comparison', name: '', version: 'comparison', kind: 'pair', pairs: [0, 1], length: 2, initial: 'Even', transitions: [], confirmation: 0, intervening: true, timeout: 0, cooldown: 0, cooldownSeconds: 0, minimum: config.minSamples, strategy: 'over', digit: candidateDigit, barrier: 1 };
    const available = history.slice(-Math.max(2, window * 2));
    const run = (ticks: Tick[], program: PatternProgram) => {
        const e = new PatternEngine();
        ticks.forEach((t, i) => { if (i && (t.symbol !== ticks[i - 1].symbol || t.epoch - ticks[i - 1].epoch > (config.group==='1-Second Volatility Indices'?1:2))) e.interrupt('Historical discontinuity.'); e.process(program, t, i + 1, config.allowOverlap, 500); });
        return e.records;
    };
    return (['over', 'under', 'matches', 'differs', 'even', 'odd'] as Strategy[]).map(strategy => {
        const p: PatternProgram = { ...base, strategy, digit: candidateDigit, version: `${base.version}-${strategy}-${candidateDigit}` };
        if (strategy === 'over' || strategy === 'under') { p.kind = 'pair'; p.pairs = strategy === 'over' ? [0, 1] : [8, 9]; p.confirmation = strategy === 'over' ? 0 : 9; p.barrier = strategy === 'over' ? 1 : 8; }
        const records = run(available, p), completed = records.filter(r => r.result === 'Pass' || r.result === 'Fail'), passes = completed.filter(r => r.result === 'Pass').length;
        const windows = [available.slice(0, window), available.slice(window)].map(ts => { const rows = run(ts, p).filter(r => r.result === 'Pass' || r.result === 'Fail'); return { completed: rows.length, frequency: rows.length ? rows.filter(r => r.result === 'Pass').length / rows.length * 100 : null }; });
        const stability = windows.every(w => w.frequency !== null) ? Math.abs(windows[1].frequency! - windows[0].frequency!) : null;
        const sufficient = window >= 1 && available.length >= window * 2 && windows.every(w => w.completed >= minimum);
        const stable = stability !== null && stability <= config.tolerance;
        return { name: strategy === 'over' ? 'Over 1 · 00/11 → 0' : strategy === 'under' ? 'Under 8 · 88/99 → 9' : `${strategy} ${['matches','differs'].includes(strategy) ? candidateDigit : ''} · configured trigger`, strategy, setups: records.filter(r => r.confirmation).length, completed: completed.length, passes, frequency: completed.length ? passes / completed.length * 100 : null, meanDelay: completed.length ? completed.reduce((n, r) => n + r.intervening.length + 1, 0) / completed.length : null, windows, stability, score: sufficient && stable ? wilsonLower(passes, completed.length) : null, reason: !sufficient ? `Inconclusive: requires ${minimum} completed outcomes in each disjoint window (${windows.map(w => w.completed).join(' / ')} observed).` : !stable ? `Not ranked: window variation ${stability?.toFixed(2)}pp exceeds tolerance ${config.tolerance}pp.` : 'Rank eligible: sample minimum and stability gate passed; score uses 95% Wilson lower bound, not raw win rate. Descriptive only.' };
    });
}
