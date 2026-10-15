import { SPEC } from './block-catalog';
import { isDetector, patternSequence } from './pattern-program';
import { defaultConfig, STRATEGIES, WINDOWS, type BotConfig, type Node } from './bot-model';
export interface Issue { severity: 'error' | 'warning'; message: string; blockId?: string }
const ownKeys = (value: object, keys: string[]) => Object.keys(value).every(k => keys.includes(k));
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
export function parseConfig(input: unknown): BotConfig {
    if (!record(input) || !ownKeys(input, Object.keys(defaultConfig()))) throw new Error('Configuration contains unexpected fields.');
    const base = defaultConfig();
    for (const key of Object.keys(base) as (keyof BotConfig)[]) {
        if (!(key in input) || typeof input[key] !== typeof base[key]) throw new Error(`Missing or invalid configuration field: ${key}`);
    }
    if (input.version !== 1 || !Array.isArray(input.nodes) || input.nodes.length > 250) throw new Error('Unsupported version or block count (maximum 250).');
    if (!['Volatility Indices','1-Second Volatility Indices'].includes(input.group) || !STRATEGIES.includes(input.strategy)) throw new Error('Unsupported market group or strategy.');
    if (!['cancel','invalidate','preserve'].includes(input.pendingOnStop)) throw new Error('Choose how pending observations are handled on Stop.');
    if (input.name.length < 1 || input.name.length > 100 || input.description.length > 2000 || input.id.length > 100 || input.symbol.length > 100) throw new Error('Invalid name, description, identifier or symbol.');
    const ranges: Record<string,number[]> = { digit:[0,9],barrier:[0,9],window:[25,1000],minSamples:[1,1000],threshold:[0,100],stabilityWindows:[2,10],tolerance:[0,100],cooldownTicks:[0,1000],cooldownSeconds:[0,86400],observeTicks:[1,100],consecutivePasses:[1,1000],maxSetups:[1,500],freshnessSeconds:[3,120] };
    for (const [key,[min,max]] of Object.entries(ranges)) {
        const n = input[key];
        if (!Number.isFinite(n) || n < min || n > max || (!['threshold','tolerance'].includes(key) && !Number.isInteger(n))) throw new Error(`Invalid ${key}: expected ${min}–${max}.`);
    }
    for (const node of input.nodes) {
        if (!record(node) || !ownKeys(node,['id','type','fields','inputs','next','x','y']) || typeof node.id !== 'string' || !node.id || node.id.length > 100 || typeof node.type !== 'string') throw new Error('Malformed block.');
        const spec = SPEC.get(node.type);
        if (!spec) throw new Error(`Unsupported block: ${node.type}. Remove it before importing.`);
        if (!record(node.fields) || !record(node.inputs) || !ownKeys(node.fields,spec.fields.map(f=>f.name)) || !ownKeys(node.inputs,[...Object.keys(spec.inputs), ...(spec.body ? ['DO'] : []), ...(spec.op === 'if_else' ? ['ELSE'] : [])])) throw new Error(`Unexpected fields or connections on ${spec.label}.`);
        for (const field of spec.fields) {
            const v = node.fields[field.name];
            if (field.kind === 'number' && (typeof v !== 'number' || !Number.isFinite(v) || v < field.min! || v > field.max! || (!['PERCENT','TOLERANCE','VALUE','LOW','HIGH'].includes(field.name) && !Number.isInteger(v)))) throw new Error(`Invalid ${field.label} in ${spec.label}.`);
            if (field.kind !== 'number' && (typeof v !== 'string' || v.length > 500 || (field.kind === 'select' && !field.choices!.includes(v)))) throw new Error(`Invalid ${field.label} in ${spec.label}.`);
            if (field.name === 'PARITIES' && !/^(Even|Odd)(\s*,\s*(Even|Odd)){1,19}$/.test(String(v))) throw new Error('Parity transitions require 2–20 comma-separated Even or Odd values, oldest first.');
            if (field.name === 'DIGITS' && !/^\s*[0-9](\s*,\s*[0-9])*\s*$/.test(String(v))) throw new Error('Digit lists must contain comma-separated digits 0–9, oldest first for sequences.');
            if (field.name === 'NAME' && (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(String(v)) || /^(system|current|active|setup|__|constructor|prototype)/i.test(String(v)))) throw new Error('Variable name is invalid or reserved.');
        }
        if (Object.values(node.inputs).some(v => typeof v !== 'string') || (node.next !== undefined && typeof node.next !== 'string') || ['x','y'].some(k => node[k] !== undefined && (typeof node[k] !== 'number' || !Number.isFinite(node[k]) || Math.abs(node[k]) > 100000))) throw new Error('Malformed block connection or position.');
    }
    // Return detached JSON, not caller-owned objects or executable properties.
    return JSON.parse(JSON.stringify(input)) as BotConfig;
}
export function validate(config: BotConfig, markets?: { apiSymbol: string; category: string }[]): Issue[] {
    const issues: Issue[] = [];
    try { parseConfig(config); } catch (e) { return [{severity:'error',message:(e as Error).message}]; }
    const error = (message: string, blockId?: string) => issues.push({severity:'error',message,blockId});
    const warning = (message: string, blockId?: string) => issues.push({severity:'warning',message,blockId});
    if (!config.symbol) error('Cannot start: no Volatility market has been selected.');
    if (markets && !markets.some(m=>m.apiSymbol===config.symbol && m.category===config.group)) error('Selected market is not available in the discovered market group.');
    if ((config.strategy==='over' && config.barrier>8) || (config.strategy==='under' && config.barrier<1)) error('Invalid barrier: Over supports 0–8; Under supports 1–9.');
    if (config.minSamples > config.window) error('Minimum sample size cannot exceed the analysis window.');
    if (config.window * config.stabilityWindows > 1000) warning('Insufficient rolling capacity for these stability windows; the condition will remain Inconclusive.');
    const byId = new Map(config.nodes.map(n=>[n.id,n]));
    if (byId.size !== config.nodes.length) error('Duplicate block identifier.');
    const incoming = new Map<string,number>();
    for (const node of config.nodes) {
        const spec = SPEC.get(node.type)!;
        for (const name of Object.keys(spec.inputs)) if (!node.inputs[name]) error(`Missing ${name} input in ${spec.label}.`,node.id);
        if (spec.body && !node.inputs.DO) error(`Connect a sequence inside ${spec.label}.`,node.id);
        for (const [name,target] of Object.entries({...node.inputs,...(node.next ? {$next:node.next} : {})})) {
            const child = byId.get(target);
            incoming.set(target,(incoming.get(target) ?? 0)+1);
            if (!child) { error('Connection refers to a missing block.',node.id); continue; }
            const childSpec = SPEC.get(child.type)!;
            const port = spec.inputs[name];
            if (port ? childSpec.output !== port : !!childSpec.output || !!childSpec.event) error(`Incompatible connection in ${spec.label}.`,node.id);
        }
        if (spec.output && node.next) error('Value blocks cannot have a next statement.',node.id);
        if (spec.event && node.next) error('Lifecycle blocks use their inner sequence, not next.',node.id);
        if (spec.op==='entry') {
            const body = byId.get(node.inputs.DO);
            const seen = new Set<string>();
            let b = body; let observes = 0;
            while (b && !seen.has(b.id)) { seen.add(b.id); if (SPEC.get(b.type)?.op.startsWith('observe')) observes++; b=b.next ? byId.get(b.next) : undefined; }
            if (observes !== 1) error('Each entry needs exactly one connected observation block in its sequence.',node.id);
        }
        if (spec.op==='between' && Number(node.fields.LOW)>Number(node.fields.HIGH)) error('Lower bound exceeds upper bound.',node.id);
        if (spec.op==='configure_over' && config.barrier>8 || spec.op==='configure_under' && config.barrier<1) error('Strategy block conflicts with the configured barrier.',node.id);
    }
    incoming.forEach((count,id)=>{ if(count>1) error('Ambiguous graph: block is connected to multiple parents.',id); });
    const roots = config.nodes.filter(n=>SPEC.get(n.type)?.event);
    if (!roots.some(n=>SPEC.get(n.type)?.event==='start')) error('Missing When Bot Starts block.');
    if (!roots.some(n=>SPEC.get(n.type)?.event==='tick')) error('Missing When New Tick Arrives block.');
    const detectors=config.nodes.filter(isDetector);
    if (!config.nodes.some(n=>SPEC.get(n.type)?.op==='entry')&&!detectors.length) error('Missing entry-condition block or pattern detector.');
    if(detectors.length>1) error('Use one detector per bot; compare independent strategies with comparison blocks.');
    if(detectors.length&&config.nodes.some(n=>SPEC.get(n.type)?.op==='entry'))error('Choose either a pattern pipeline or a generic entry, not both.');
    for(const detector of detectors){
        const chain=patternSequence(detector,config.nodes);const ops=chain.map(n=>SPEC.get(n.type)!.op);
        const confirmations=ops.filter(op=>op.startsWith('pattern_confirm_')).length;
        if(confirmations!==1&&!(confirmations===0&&SPEC.get(detector.type)!.op==='pattern_detect_parity'))error('Connect exactly one confirmation block after the detector (Parity Pattern includes its own confirmation).',detector.id);
        if(ops.filter(op=>op==='pattern_emit').length!==1)error('Connect exactly one Emit Setup Detected block after confirmation.',detector.id);
        if(ops.filter(op=>['pattern_barrier','pattern_parity_outcome','pattern_subsequent'].includes(op)).length!==1)error('Connect exactly one subsequent-tick evaluation block.',detector.id);
        if(!ops.includes('pattern_record'))error('Connect Record Observed Outcome to the pattern sequence.',detector.id);
        const confirm=ops.findIndex(op=>op.startsWith('pattern_confirm_'));const emit=ops.indexOf('pattern_emit');const evaluate=ops.findIndex(op=>['pattern_barrier','pattern_parity_outcome','pattern_subsequent'].includes(op));
        if(confirm>emit||emit>evaluate||evaluate>ops.indexOf('pattern_record'))error('Sequence must be detector → confirmation → emit → next-tick evaluation → record.',detector.id);
        if(chain.slice(1).some(n=>!SPEC.get(n.type)!.op.startsWith('pattern_')||isDetector(n)))error('Pattern declarations must form one uninterrupted pipeline; put unrelated controls in another event.',detector.id);
    }
    const declarations=new Set(detectors.flatMap(d=>patternSequence(d,config.nodes).slice(1).map(n=>n.id)));
    for(const n of config.nodes){const op=SPEC.get(n.type)!.op;if(op.startsWith('pattern_')&&!isDetector(n)&&!['pattern_reset','pattern_allow_next','pattern_explain'].includes(op)&&!declarations.has(n.id))error('Connect this declaration after a pattern detector.',n.id);}
    if (config.nodes.filter(n=>SPEC.get(n.type)?.op==='entry').length>1) error('Use one entry definition per bot to avoid ambiguous setups.');
    const visited = new Set<string>(); const active = new Set<string>();
    const walk = (id: string, depth: number) => {
        if (active.has(id)) { error('Cycle detected: unbounded loops are not allowed.',id); return; }
        if (depth>50) { error('Graph nesting exceeds 50.',id); return; }
        if (visited.has(id)) return;
        visited.add(id); active.add(id);
        const n=byId.get(id);
        if(n) [...Object.values(n.inputs),...(n.next?[n.next]:[])].forEach(child=>walk(child,depth+1));
        active.delete(id);
    };
    roots.forEach(n=>walk(n.id,0));
    const parentOf = (id: string) => config.nodes.find(n=>Object.values(n.inputs).includes(id)||n.next===id);
    for(const node of config.nodes) {
        const op=SPEC.get(node.type)!.op;
        if(op==='entry'||op.startsWith('observe')||isDetector(node)) {
            const chain: Node[]=[];let current:Node|undefined=node;const seen=new Set<string>();
            while(current&&!seen.has(current.id)){seen.add(current.id);chain.push(current);current=parentOf(current.id);}
            if((op==='entry'||isDetector(node))&&!chain.some(n=>SPEC.get(n.type)?.event==='tick'))error('Entry definitions must run inside When New Tick Arrives.',node.id);
            if(op.startsWith('observe')&&!chain.some(n=>SPEC.get(n.type)?.op==='entry'))error('Observation blocks must be connected inside an entry definition.',node.id);
            if(op.startsWith('observe_')&&op.slice(8)!==config.strategy)error('Observation strategy must match the selected strategy.',node.id);
        }
    }
    config.nodes.filter(n=>!visited.has(n.id)).forEach(n=>error('Unreachable block: connect or delete it.',n.id));
    const hasInEntry = (op: string) => {
        const entry=config.nodes.find(n=>SPEC.get(n.type)?.op==='entry');
        const seen = new Set<string>();
        const search=(id?:string):boolean=>{if(!id || seen.has(id)) return false;seen.add(id);const n=byId.get(id);return !!n&&(SPEC.get(n.type)?.op===op||Object.values(n.inputs).some(search));};
        return search(entry?.inputs.CONDITION);
    };
    if (!detectors.length&&!hasInEntry('fresh')) warning('Add Require Fresh Market Data to explain quality checks visually. The engine always enforces freshness.');
    if (!detectors.length&&!hasInEntry('sample')) warning('Add a minimum-sample block. The engine always enforces the configured minimum.');
    // Catch the common direct contradiction without claiming general SAT solving.
    const equals=config.nodes.filter(n=>SPEC.get(n.type)?.op==='eq');
    if(new Set(equals.map(n=>n.fields.DIGIT)).size>1 && config.nodes.some(n=>SPEC.get(n.type)?.op==='and')) warning('Different digit-equality tests joined with AND may contradict each other.');
    if(config.nodes.filter(n=>['cooldown_ticks','cooldown_seconds'].includes(SPEC.get(n.type)!.op)).length>1) error('Conflicting restart blocks: choose one cooldown block; combine tick/second limits in the configuration panel instead.');
    return issues;
}
