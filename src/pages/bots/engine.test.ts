import { BLOCKS, defaults } from './block-catalog';
import { ALL_DIGITS, compound, frequency, outcome, type Node, type Tick } from './bot-model';
import { BotEngine } from './engine';
import { example } from './examples';
import { parseConfig, validate } from './validation';
import { formatQuote, extractLastDigit } from '../digits/precision';
import { loadBots, saveBot } from './persistence';
let uuid=0;
beforeAll(()=>Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=>`test-bot-${++uuid}`}));
const ticks=(digits:number[],start=1700000000):Tick[]=>digits.map((digit,i)=>({key:`TEST:${start+i}:${digit}`,epoch:start+i,digit,price:`100.${digit}`,symbol:'TEST'}));
function config() {const c=example();c.symbol='TEST';return c;}
function simple() {const c=config();c.minSamples=1;c.window=25;c.repeated=true;c.cooldownTicks=2;c.nodes=c.nodes.filter(n=>!['quality','fresh','filtered','sample','rule','frequency','stable'].includes(n.id));c.nodes.find(n=>n.id==='entry')!.inputs.CONDITION='true';c.nodes.push({id:'true',type:'obs_number',fields:{VALUE:1},inputs:{}});c.nodes.find(n=>n.id==='true')!.type='obs_connected';c.nodes.find(n=>n.id==='true')!.fields={};c.nodes.find(n=>n.id==='cooldown')!.fields.N=2;return c;}
function running(c=simple()) {const e=new BotEngine(c,'replay');e.start(1700000000000);e.connection(true,true,1700000000000);return e;}
function evaluate(type:string,fields:Record<string,string|number>={},digits=ALL_DIGITS.concat(ALL_DIGITS)) {
    const c=config();c.minSamples=10;c.window=25;const node:Node={id:'probe',type,fields:{...defaults(type),...fields},inputs:{}};c.nodes=[node];
    const e=new BotEngine(c,'replay');e.seed(ticks(digits));e.connection(true,true,1700000020000);return e.test('probe');
}
describe('observational engine',()=>{
    it('validates every editable example after a dynamically discovered market is selected',()=>{for(let i=0;i<5;i++){const c=example(i);c.symbol='TEST';expect(validate(c).filter(i=>i.severity==='error')).toEqual([]);}});
    it('keeps precision and trailing zeros',()=>{expect(formatQuote(123.4,3)).toBe('123.400');expect(extractLastDigit(formatQuote(123.4,3))).toBe(0);});
    it('defines deterministic compound three-valued logic',()=>{
        const r=(status:'Pass'|'Fail'|'Inconclusive')=>({status,value:null,reason:''});
        expect(compound('and',[r('Pass'),r('Inconclusive')]).status).toBe('Inconclusive');expect(compound('and',[r('Fail'),r('Inconclusive')]).status).toBe('Fail');expect(compound('or',[r('Pass'),r('Inconclusive')]).status).toBe('Pass');expect(compound('not',[r('Inconclusive')]).status).toBe('Inconclusive');
    });
    it.each(['matches','differs','over','under','even','odd'] as const)('defines exact %s outcomes for every digit',strategy=>{for(let d=0;d<10;d++){const expected=strategy==='matches'?d===2:strategy==='differs'?d!==2:strategy==='over'?d>2:strategy==='under'?d<2:strategy==='even'?d%2===0:d%2===1;expect(outcome(strategy,d,2,2)).toBe(expected);}});
    it('counts raw frequency without rounding',()=>expect(frequency([0,0,1],[0])).toBeCloseTo(200/3));
    it('does not equate low frequency with stability',()=>{
        const digits=[...Array(25).fill(1),...Array(25).fill(2)];expect(evaluate('obs_stable',{DIGIT:2,N:2,TOLERANCE:5},digits).status).toBe('Fail');expect(evaluate('obs_stable',{DIGIT:2,N:2,TOLERANCE:5},[1,2]).status).toBe('Inconclusive');
    });
    it('reads chronological patterns without reversing',()=>{expect(evaluate('obs_sequence',{DIGITS:'2,7,4'},[2,7,4]).status).toBe('Pass');expect(evaluate('obs_sequence',{DIGITS:'4,7,2'},[2,7,4]).status).toBe('Fail');});
    it.each(BLOCKS.filter(b=>b.output&&!Object.keys(b.inputs).length))('evaluates registered value block $type with an explicit result',spec=>{const r=evaluate(spec.type);expect(['Pass','Fail','Inconclusive']).toContain(r.status);expect(typeof r.reason).toBe('string');expect(r.reason.length).toBeGreaterThan(0);});
    it('deduplicates setups and waits for subsequent ticks',()=>{const e=running();const fixture=ticks([2,3,4,5,6]);e.step(fixture[0]);expect(e.pending).toHaveLength(1);expect(e.journal[0].subsequent).toEqual([]);e.step(fixture[0]);expect(e.journal).toHaveLength(1);const original=JSON.stringify(e.journal[0].config);e.step(fixture[1]);expect(e.journal[0].status).toBe('Not qualified');expect(JSON.stringify(e.journal[0].config)).toBe(original);expect(e.state).toBe('Cooldown');e.step(fixture[2]);expect(e.journal).toHaveLength(1);e.step(fixture[3]);expect(e.journal).toHaveLength(2);});
    it('allows rising-edge signals only unless explicitly repeated',()=>{const c=simple();c.repeated=false;c.cooldownTicks=0;const e=running(c);ticks([1,2,3,4,5,6]).forEach(t=>e.step(t));expect(e.journal).toHaveLength(1);});
    it('requires consecutive passing conditions before signalling',()=>{const c=simple();c.consecutivePasses=3;c.repeated=false;const e=running(c);const f=ticks([2,3,4]);e.step(f[0]);e.step(f[1]);expect(e.journal).toHaveLength(0);e.step(f[2]);expect(e.journal).toHaveLength(1);});
    it('pauses, resumes, and invalidates observations spanning missed ticks',()=>{const e=running();const f=ticks([2,3,4]);e.step(f[0]);e.pause();e.step(f[1]);expect(e.history).toHaveLength(1);e.resume();expect(e.journal[0].status).toBe('Inconclusive');e.step(f[2]);expect(e.history).toHaveLength(2);});
    it.each(['cancel','invalidate','preserve'] as const)('honours Stop policy %s and ignores future ticks',policy=>{const c=simple();c.pendingOnStop=policy;const e=running(c);const f=ticks([2,3]);e.step(f[0]);e.stop();e.step(f[1]);expect(e.state).toBe('Stopped');expect(e.history).toHaveLength(1);expect(e.journal[0].status).toBe(policy==='cancel'?'Cancelled':policy==='invalidate'?'Inconclusive':'Pending');e.stop();expect(e.state).toBe('Stopped');});
    it('suspends on interruption, resynchronises before processing',()=>{const e=running();const f=ticks([1,2,3]);e.step(f[0]);e.connection(false,false);expect(e.journal[0].status).toBe('Inconclusive');e.connection(true,false);e.step(f[1]);expect(e.history).toHaveLength(1);e.seed(f.slice(0,2));e.connection(true,true);e.step(f[2]);expect(e.history).toHaveLength(3);});
    it('never exposes future replay ticks and marks short endings Inconclusive',()=>{const e=running();const f=ticks([1,2,3]);e.step(f[0]);expect(e.current?.digit).toBe(1);expect(e.history.map(t=>t.digit)).toEqual([1]);expect(e.journal[0].subsequent).toEqual([]);e.finish();expect(e.journal[0].status).toBe('Inconclusive');});
    it('bounds the execution trace and preserves journal on reset',()=>{const e=running();ticks(Array(200).fill(2)).forEach(t=>e.step(t));expect(e.trace.length).toBeLessThanOrEqual(500);const count=e.journal.length;e.reset();expect(e.journal.length).toBe(count);});
    it('rejects unsupported imported code, unexpected keys and bad fields',()=>{
        expect(()=>parseConfig({...config(),execute:'alert(1)'})).toThrow();const c=config();c.nodes[0].type='javascript';expect(()=>parseConfig(c)).toThrow('Unsupported block');
        const bad=config();bad.digit=12;expect(()=>parseConfig(bad)).toThrow('Invalid digit');
    });
    it('rejects cycles, incompatible connections and unreachable blocks',()=>{const c=config();c.nodes.find(n=>n.id==='observe')!.next='observe';expect(validate(c).some(i=>i.message.includes('Cycle'))).toBe(true);const d=config();d.nodes.find(n=>n.id==='fresh')!.type='obs_number';d.nodes.find(n=>n.id==='fresh')!.fields={VALUE:1};expect(validate(d).some(i=>i.message.includes('Incompatible'))).toBe(true);});
    it('round trips validated configurations and bounded journal in browser storage',()=>{localStorage.clear();const c=config();saveBot(c,[],[]);expect(loadBots()[0].config).toEqual(c);localStorage.clear();});
});
