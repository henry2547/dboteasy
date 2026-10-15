import { defaults } from './block-catalog';
import { defaultConfig, type BotConfig, type Node, type Strategy } from './bot-model';
export const EXAMPLES = [
    {name:'Matches Digit Observer', strategy:'matches'},
    {name:'Differs Digit Observer', strategy:'differs'},
    {name:'Over 2 Filter Observer', strategy:'over'},
    {name:'Over 1 Filter Observer', strategy:'over'},
    {name:'Even / Odd Observer', strategy:'even'},
    {name:'00 / 11 → 0 → Over 1', strategy:'over'},
    {name:'88 / 99 → 9 → Under 8', strategy:'under'},
    {name:'Even run → Odd confirmation → Odd evaluation', strategy:'odd'},
    {name:'Odd run → Even confirmation → Even evaluation', strategy:'even'},
    {name:'Even run → Even confirmation → Even evaluation', strategy:'even'},
    {name:'Odd run → Odd confirmation → Odd evaluation', strategy:'odd'},
    {name:'Parity transitions → confirmation → next tick', strategy:'odd'},
] as const;
export function example(index = 0): BotConfig {
    if(index>=5)return patternExample(index-5);
    const selected=EXAMPLES[index] ?? EXAMPLES[0];
    const config={...defaultConfig(),name:selected.name,strategy:selected.strategy as Strategy,barrier:index===3?1:2};
    const nodes: Node[]=[];
    const add=(id:string,type:string,inputs:Record<string,string>={},next?:string,fields={})=>{nodes.push({id,type:`obs_${type}`,fields:{...defaults(`obs_${type}`),...fields},inputs,...(next?{next}:{}),x:30,y:id==='start'?30:180});};
    add('start','on_start',{DO:'use'});
    add('use','use_market',{},'strategy');
    add('strategy',`configure_${config.strategy}`);
    add('tick','on_tick',{DO:'entry'});
    add('entry','entry',{CONDITION:'quality',DO:'observe'});
    add('quality','and',{A:'fresh',B:'filtered'});
    add('fresh','require_fresh');
    add('filtered','and',{A:'sample',B:'rule'});
    add('sample','require_sample',{},undefined,{N:100});
    if(index<2) {
        add('rule','and',{A:'frequency',B:'stable'});
        add('frequency','freq_at_or_below',{},undefined,{DIGIT:2,PERCENT:15});
        add('stable','stable',{},undefined,{DIGIT:2,N:2,TOLERANCE:5});
    } else if(index===2) {
        add('rule','and',{A:'low0',B:'low12'}); add('low0','and',{A:'f0',B:'s0'});
        add('f0','freq_at_or_below',{},undefined,{DIGIT:0,PERCENT:15}); add('s0','stable',{},undefined,{DIGIT:0,N:2,TOLERANCE:5});
        add('low12','and',{A:'low1',B:'low2'});
        [1,2].forEach(d=>{add(`low${d}`,'and',{A:`f${d}`,B:`s${d}`});add(`f${d}`,'freq_at_or_below',{},undefined,{DIGIT:d,PERCENT:15});add(`s${d}`,'stable',{},undefined,{DIGIT:d,N:2,TOLERANCE:5});});
    } else if(index===3) {
        add('rule','and',{A:'zero',B:'candidate'});
        add('zero','and',{A:'f0',B:'s0'}); add('f0','freq_at_or_below',{},undefined,{DIGIT:0,PERCENT:15}); add('s0','stable',{},undefined,{DIGIT:0,N:2,TOLERANCE:5});
        add('candidate','or',{A:'f5',B:'f6'}); [5,6].forEach(d=>add(`f${d}`,'freq_at_or_above',{},undefined,{DIGIT:d,PERCENT:8}));
    } else {
        add('rule','and',{A:'parity',B:'stable'});add('parity','compare_gte',{A:'evenf',B:'threshold'});add('evenf','even_frequency');add('threshold','number',{},undefined,{VALUE:50});add('stable','parity_stable');
    }
    add('observe','observe',{},undefined,{N:1});
    add('complete','on_complete',{DO:'cooldown'});add('cooldown','cooldown_ticks',{},undefined,{N:5});
    config.nodes=nodes; return config;
}

/** Editable declarative pipelines: every field is read by compilePattern. */
export function patternExample(index=0): BotConfig {
    const selected=EXAMPLES[index+5]??EXAMPLES[5];
    const config={...defaultConfig(),name:selected.name,strategy:selected.strategy as Strategy,minSamples:25,cooldownTicks:0,barrier:index===1?8:1};
    const nodes:Node[]=[];
    const add=(id:string,type:string,next?:string,fields:Record<string,string|number>={},inputs:Record<string,string>={})=>nodes.push({id,type:'obs_'+type,fields:{...defaults('obs_'+type),...fields},inputs,...(next?{next}:{}),x:30,y:30});
    add('start','on_start',undefined,{}, {DO:'monitor'});add('monitor','monitor_start');
    add('tick','genuine_tick',undefined,{}, {DO:'detector'});
    if(index<2)add('detector','pair','confirm',{PAIRS:index===0?'00 / 11':'88 / 99'});
    else if(index===6)add('detector','parity_sequence','confirm',{PARITIES:'Even,Odd,Even'});
    else add('detector',index===2||index===4?'even_run':'odd_run','confirm',{N:2});
    if(index<2)add('confirm','confirmation','intervening',{DIGIT:index===0?0:9});
    else add('confirm','parity_confirmation','intervening',{PARITY:config.strategy==='odd'?'Odd':'Even'});
    add('intervening','intervening','timeout');add('timeout','confirmation_wait','dedup',{N:0});add('dedup','prevent_duplicate','emit');
    add('emit',index<2?'emit_setup':'emit_parity','evaluate');
    if(index<2)add('evaluate','barrier_outcome','record',{RULE:index===0?'Over 1':'Under 8'});
    else add('evaluate','parity_outcome','record',{PARITY:config.strategy==='odd'?'Odd':'Even'});
    add('record','record_outcome');config.nodes=nodes;return config;
}
