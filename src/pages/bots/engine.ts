import { SPEC } from './block-catalog';
import { ALL_DIGITS, compound, frequency, outcome, result, type BotConfig, type BotState, type Node, type Observation, type Result, type Tick, type Trace } from './bot-model';
import { parseConfig, validate } from './validation';
import { PatternEngine } from './pattern-engine';
import { compilePattern } from './pattern-program';
import { advancedValue, compareStrategies, type StrategyComparison } from './pattern-statistics';

/** A bounded graph interpreter. No JavaScript generator, eval, trading client or account access. */
export class BotEngine {
    patterns = new PatternEngine();
    comparisons: StrategyComparison[] = [];
    private nextTicks = new Map<string, string | undefined>();
    state: BotState = 'Stopped';
    reason = 'Ready to build. Start runs public-data observations only.';
    history: Tick[] = [];
    journal: Observation[] = [];
    trace: Trace[] = [];
    config: BotConfig;
    mode: 'live' | 'replay';
    connected = false;
    ready = false;
    tickIndex = 0;
    passCount = 0;
    failCount = 0;
    private graph: Map<string, Node>;
    private variables = new Map<string,number>();
    private counters = new Map<string,number>();
    private memo = new Map<string,Result>();
    private once = new Set<string>();
    private waiters = new Map<string,Node>();
    private lastCondition = false;
    private seen = new Set<string>();
    private lastSignalKey = '';
    private cooldownUntilTick = 0;
    private cooldownUntilTime = 0;
    private budget = 500;
    private sequence = 0;
    private now = 0;
    private startedAt = 0;
    private evalTraceStart = 0;
    private activeSetup: Observation | null = null;
    private endEvent = false;
    private lastNote = '';
    private streakResetAt: number | null = null;
    constructor(config: BotConfig, mode: 'live' | 'replay' = 'live') {
        this.config=parseConfig(config); this.graph=new Map(this.config.nodes.map(n=>[n.id,n])); this.mode=mode;
    }
    get pending() { return this.journal.filter(o=>o.status==='Pending'); }
    get completed() { return this.journal.filter(o=>['Qualified','Not qualified'].includes(o.status)); }
    get current() { return this.history[this.history.length-1]; }
    get digits() { return this.history.slice(-this.config.window).map(t=>t.digit); }
    get cooldown() { return this.patterns.cooldown>0||this.patterns.cooldownSeconds>0||this.tickIndex<this.cooldownUntilTick || this.now<this.cooldownUntilTime; }
    get active() { return !['Stopped','Paused','Completed','Error'].includes(this.state); }
    private transition(state: BotState, reason: string) { this.state=state; this.reason=reason; }
    private log(node: Node | null, r: Result, label?: string) {
        this.trace.push({id:++this.sequence,time:this.now || Date.now(),blockId:node?.id ?? '',label:label ?? (node ? SPEC.get(node.type)!.label : 'Session'),status:r.status,reason:r.reason,value:r.value,digit:this.current?.digit ?? null,state:this.state,market:this.config.symbol});
        if(this.trace.length>500) this.trace.shift();
    }
    seed(ticks: Tick[]) {
        if(ticks.some(t=>!this.validTick(t))) throw new Error('History contains invalid ticks or the wrong market.');
        for(let i=1;i<ticks.length;i++) if(ticks[i].epoch<ticks[i-1].epoch) throw new Error('History is not chronological.');
        this.history=ticks.slice(-1000); this.seen=new Set(this.history.map(t=>t.key));
    }
    private validTick(t: Tick) { return t.symbol===this.config.symbol && Number.isInteger(t.digit) && t.digit>=0 && t.digit<=9 && Number.isFinite(t.epoch) && Number.isFinite(Number(t.price)) && typeof t.key==='string'; }
    start(now=Date.now()) {
        const errors=validate(this.config).filter(i=>i.severity==='error');
        if(errors.length) {this.transition('Error',errors[0].message);return;}
        this.now=now;this.startedAt=now;this.transition('Initialising','Loading genuine history before observations.');
        this.dispatch('start');
        if(this.active && this.ready) this.transition('Analysing','History ready. Waiting for the next genuine tick.');
    }
    connection(connected: boolean, ready: boolean, now=Date.now()) {
        const restored=!this.connected && connected;
        this.connected=connected;this.ready=ready;this.now=now;
        if(!this.active) return;
        if(!connected) {
            this.waiters.clear();this.nextTicks.clear();this.invalidatePending('Data connection interrupted; no missing outcomes are invented.');
            this.transition('Data Interrupted','New setups suspended: public market data is disconnected.');this.dispatch('lost');
        } else if(!ready) {this.invalidatePending('Data is resynchronising; uncertain sequences invalidated.');this.transition('Resynchronising','Reloading genuine history; setup detection is suspended.');}
        else if(restored || this.state==='Resynchronising' || this.state==='Initialising') {
            this.patterns.synchronised();this.transition('Analysing','History resynchronised. New ticks can be observed.');this.dispatch('restored');
        }
    }
    checkFreshness(now=Date.now()) {
        this.now=now;
        if(this.active && this.mode==='live' && this.current && now-this.current.epoch*1000>this.config.freshnessSeconds*1000) {
            this.ready=false;this.invalidatePending('Market data became stale before the observation completed.');this.waiters.clear();this.nextTicks.clear();
            this.transition('Data Interrupted','Latest tick is stale. Waiting for valid data and resynchronisation.');
        }
    }
    pause() { if(this.active) {this.waiters.clear();this.nextTicks.clear();this.invalidatePending('Paused: skipped ticks cannot be used to confirm or evaluate a pattern.');this.transition('Paused','Paused. Configuration and journal preserved; outcomes across a pause are not inferred.');this.log(null,result('Pass',this.reason),'Pause');} }
    resume() {
        if(this.state!=='Paused') return;
        this.invalidatePending('Evaluation interrupted by a pause; skipped ticks cannot be reconstructed.');
        this.transition(this.ready&&this.connected?'Analysing':'Resynchronising','Resumed; pending observations spanning a pause are Inconclusive.');this.dispatch('resume');
    }
    stop() {
        this.waiters.clear();this.nextTicks.clear();this.patterns.interrupt('Session stopped before the pattern completed.');this.syncPatterns();
        for(const o of this.pending) {
            if(this.config.pendingOnStop==='cancel') {o.status='Cancelled';o.reason='Cancelled by Stop.';}
            else if(this.config.pendingOnStop==='invalidate') {o.status='Inconclusive';o.reason='Stopped before all subsequent ticks were observed.';}
        }
        this.transition('Stopped',`Stopped. Pending evaluation policy: ${this.config.pendingOnStop}. Session resources released.`);
        this.log(null,result('Pass',this.reason),'Stop');
    }
    finish() {this.invalidatePending('Historical sample ended before all required subsequent ticks arrived.');this.transition('Completed','Replay completed using only available genuine history.');}
    reset() {this.stop();this.passCount=0;this.failCount=0;this.counters.clear();this.variables.clear();this.lastCondition=false;this.cooldownUntilTick=0;this.cooldownUntilTime=0;this.log(null,result('Pass','Live counters reset; historical journal preserved.'),'Reset');}
    private invalidatePending(reason: string) {this.patterns.interrupt(reason);this.syncPatterns();for(const o of this.pending){o.status='Inconclusive';o.reason=reason;}}
    step(tick: Tick, now=tick.epoch*1000) {
        if(!this.active || !this.connected || !this.ready) return;
        this.now=now;
        if(!this.validTick(tick) || (this.current && tick.epoch<this.current.epoch)) {this.connection(false,false,now);return;}
        if(this.seen.has(tick.key)) return;
        if(this.mode==='live' && (now-tick.epoch*1000>this.config.freshnessSeconds*1000 || tick.epoch*1000>now+5000)) {this.ready=false;this.invalidatePending('Stale or future-dated tick rejected.');this.transition('Data Interrupted','Invalid tick timing; genuine history must resynchronise.');return;}
        // A discontinuity invalidates pending outcomes; do not substitute backfilled ticks.
        if(this.current && tick.epoch-this.current.epoch>(this.config.group==='1-Second Volatility Indices'?1:2)) {this.invalidatePending('Gap in genuine ticks interrupted the sequence.');if(this.mode==='live'){this.ready=false;this.transition('Data Interrupted','Tick gap detected; a fresh historical synchronisation is required.');return;}}
        this.history=[...this.history,tick].slice(-1000);this.seen=new Set(this.history.map(t=>t.key));this.tickIndex++;
        if(this.state==='Data Interrupted') this.transition('Analysing','A fresh genuine tick restored data quality.');
        this.memo.clear();this.evalTraceStart=this.sequence;
        for(const o of [...this.pending].filter(o=>!o.pattern)) {
            if(tick.epoch*1000<o.time || tick.key===o.tickKey) continue;
            o.subsequent.push({...tick});
            if(o.subsequent.length>=o.requiredTicks) {
                const last=o.subsequent[o.subsequent.length-1];
                o.status=outcome(o.config.strategy,last.digit,o.config.digit,o.config.barrier)?'Qualified':'Not qualified';
                o.reason=`${o.config.strategy}: subsequent digit ${last.digit}; selected ${o.config.digit}, barrier ${o.config.barrier}. Barrier equality is neither Over nor Under.`;
                this.cooldownUntilTick=this.tickIndex+this.config.cooldownTicks;this.cooldownUntilTime=now+this.config.cooldownSeconds*1000;
                this.log(null,result(o.status==='Qualified'?'Pass':'Fail',o.reason),'Evaluation completed');this.dispatch('complete');
            }
        }
        if(!this.active) return;
        // Paused/stopped sessions do not accumulate waiting callbacks or run on renders.
        for(const waiter of [...this.waiters.values()]) {
            if(this.test(waiter.inputs.CONDITION).status==='Pass') {this.waiters.delete(waiter.id);this.run(waiter.inputs.DO);}
        }
        const deferred=[...this.nextTicks.values()];this.nextTicks.clear();for(const next of deferred)this.run(next);
        this.dispatch('tick');
        if(this.active) this.dispatch('window');
        this.syncPatterns();
        if(!this.active) return;
        this.transition(this.pending.length?'Evaluation Pending':this.cooldown?'Cooldown':'Waiting For Entry Conditions',this.pending.length?`${this.pending.length} observation(s) waiting for genuine subsequent ticks.`:this.cooldown?`Restart blocked: cooldown (${Math.max(0,this.cooldownUntilTick-this.tickIndex)} ticks remaining).`:this.reason);
    }
    private dispatch(event: string) {
        this.budget=500;this.once.clear();this.endEvent=false;this.memo.clear();
        for(const node of this.config.nodes.filter(n=>SPEC.get(n.type)?.event===event)) {
            if(this.endEvent || ['Stopped','Paused','Error'].includes(this.state)) break;
            this.log(node,result('Pass',`Event: ${event}`));this.run(node.inputs.DO);
        }
    }
    test(id?: string): Result {
        if(!id) return result('Inconclusive','Missing condition input.',null);
        const cached=this.memo.get(id);if(cached) return cached;
        const node=this.graph.get(id);if(!node) return result('Inconclusive','Missing block.',null);
        if(--this.budget<0) {this.transition('Error','Evaluation operation limit exceeded.');return result('Inconclusive',this.reason,null);}
        const spec=SPEC.get(node.type)!;const op=spec.op;const f=node.fields;const n=Number(f.N);const d=Number(f.DIGIT);const p=Number(f.PERCENT);const ds=this.digits;
        const v=(name:string)=>this.test(node.inputs[name]);
        const bool=(yes:boolean,reason:string)=>result(yes?'Pass':'Fail',reason);
        const number=(value:number,reason:string)=>Number.isFinite(value)?result('Pass',reason,value):result('Inconclusive','Insufficient sample.',null);
        const list=()=>String(f.DIGITS).split(',').map(Number);
        const minimum=()=>ds.length>=this.config.minSamples;
        let r:Result=result('Inconclusive','Insufficient or unavailable data.',null);
        const advanced=advancedValue(op,node,this.history,this.config,this.patterns);
        if(advanced) r=advanced;
        else if(op==='research_candidate') {this.comparisons=compareStrategies(this.history,this.config,Number(f.MINIMUM),Math.floor(this.history.length/2),Number(f.DIGIT));const row=this.comparisons.find(row=>row.strategy===f.STRATEGY)!;r=row.score===null?result('Inconclusive',row.reason,null):result('Pass',`${row.name}: ${row.passes}/${row.completed}; mean confirmation delay ${row.meanDelay}; stability ${row.stability}pp. ${row.reason}`,row.frequency);}
        else if(['and','or','not'].includes(op)) r=compound(op,Object.keys(spec.inputs).map(v));
        else if(op==='sample') r=result(this.history.length>=n?'Pass':'Inconclusive',`${this.history.length} genuine ticks available; requires ${n}.`);
        else if(op==='fresh') r=this.current?bool(this.now-this.current.epoch*1000<=this.config.freshnessSeconds*1000,`Last tick age ${Math.max(0,(this.now-this.current.epoch*1000)/1000).toFixed(1)}s; limit ${this.config.freshnessSeconds}s.`):r;
        else if(op==='ready') r=bool(this.connected&&this.ready,'History loaded and public connection ready.');
        else if(op==='connected') r=bool(this.connected,'Public market-data connection.');
        else if(op==='no_pending') r=bool(this.pending.length===0,`${this.pending.length} pending evaluations.`);
        else if(op==='cooldown_complete') r=bool(!this.cooldown,`Cooldown: ${Math.max(0,this.cooldownUntilTick-this.tickIndex)} ticks; ${Math.max(0,(this.cooldownUntilTime-this.now)/1000).toFixed(1)}s.`);
        else if(op==='no_duplicate') r=bool(this.current?.key!==this.lastSignalKey,'Setup key must differ from the last signal.');
        else if(op==='setup_limit') r=bool(this.journal.length<this.config.maxSetups,`${this.journal.length}/${this.config.maxSetups} setups.`);
        else if(op==='selected') r=bool(Number.isInteger(this.config.digit)&&this.config.digit>=0&&this.config.digit<=9,`Selected digit ${this.config.digit}.`);
        else if(op==='number') r=number(Number(f.VALUE),'Configured numeric constant.');
        else if(op==='variable') r=this.variables.has(String(f.NAME))?number(this.variables.get(String(f.NAME))!,'User variable.'):result('Inconclusive','Variable has not been set.',null);
        else if(op==='selected_digit' || op==='barrier' || op==='window' || op==='count') r=number(op==='selected_digit'?this.config.digit:op==='barrier'?this.config.barrier:op==='window'?this.config.window:this.history.length,spec.label);
        else if(op==='symbol' || op==='market_name') r=result('Pass',op==='market_name'?'Market symbol (full name appears in the market selector).':'Active public symbol.',this.config.symbol);
        else if(op==='historical_sample') r=number(this.completed.length,'Completed observations for the current market and strategy.');
        else if(op==='historical_frequency') {const rows=this.completed.filter(o=>o.market===this.config.symbol&&o.config.strategy===this.config.strategy);r=number(rows.length?rows.filter(o=>o.status==='Qualified').length/rows.length*100:NaN,`${rows.length} completed observations; descriptive only.`);}
        else if(op.startsWith('compare_') || op==='between') {
            const a=v('A');const b=op==='between'?null:v('B');
            if(a.status==='Inconclusive'||b?.status==='Inconclusive') r=result('Inconclusive','Comparison has missing input.',null);
            else {const av=Number(a.value),bv=Number(b?.value);const cmp=op.replace('compare_','');r=bool(op==='between'?av>=Number(f.LOW)&&av<=Number(f.HIGH):cmp==='eq'?av===bv:cmp==='ne'?av!==bv:cmp==='gt'?av>bv:cmp==='lt'?av<bv:cmp==='gte'?av>=bv:av<=bv,`${av} ${cmp} ${op==='between'?`${f.LOW}–${f.HIGH}`:bv}`);}
        } else if(op==='consecutive_pass' || op==='consecutive_fail') {
            const inner=v('CONDITION');const desired=op==='consecutive_pass'?'Pass':'Fail';const count=inner.status===desired?(this.counters.get(node.id)??0)+1:0;this.counters.set(node.id,count);r=inner.status==='Inconclusive'?result('Inconclusive',inner.reason):bool(count>=n,`${count}/${n} consecutive ${desired} evaluations.`);
        } else if(ds.length) {
            const latest=ds[ds.length-1];let streak=1;while(streak<ds.length && ds[ds.length-1-streak]===latest) streak++;
            if(this.streakResetAt!==null)streak=Math.min(streak,this.tickIndex-this.streakResetAt+1);
            if(op==='latest') r=number(latest,'Final digit extracted using instrument precision.');
            else if(op==='ago') r=ds.length>n?number(ds[ds.length-1-n],`${n} ticks ago.`):r;
            else if(op==='price' || op==='timestamp') r=number(op==='price'?Number(this.current!.price):this.current!.epoch,spec.label);
            else if(op==='last_digits') r=ds.length>=n?result('Pass',`${n} chronological genuine digits.`,ds.slice(-n)):r;
            else if(op==='streak') r=number(streak,`Current digit ${latest} streak.`);
            else if(op==='longest') {let best=1,run=1;for(let i=1;i<ds.length;i++){run=ds[i]===ds[i-1]?run+1:1;best=Math.max(best,run);}r=number(best,'Longest streak in analysis window.');}
            else if(op==='sequence') {const pattern=list();r=ds.length>=pattern.length?bool(pattern.every((v,i)=>v===ds[ds.length-pattern.length+i]),`Chronological pattern ${pattern.join(',')}; latest ${ds.slice(-pattern.length).join(',')}.`):r;}
            else if(['contains','not_contains','consecutive'].includes(op)) r=ds.length>=n?bool(op==='contains'?ds.slice(-n).includes(d):op==='not_contains'?!ds.slice(-n).includes(d):ds.slice(-n).every(x=>x===d),`Last ${n}: ${ds.slice(-n).join(',')}; selected ${d}.`):r;
            else if(op==='streak_at_least') r=bool(streak>=n,`Streak ${streak}; requires ${n}.`);
            else if(['eq','ne','gt','lt','even','odd','previous_eq'].includes(op)) {r=op==='previous_eq'&&ds.length<2?r:bool(op==='eq'?latest===d:op==='ne'?latest!==d:op==='gt'?latest>d:op==='lt'?latest<d:op==='even'?latest%2===0:op==='odd'?latest%2===1:ds[ds.length-2]===d,`Latest ${latest}; previous ${ds[ds.length-2] ?? 'unavailable'}; selected ${d}.`);}
            else if(op==='stable'||op==='parity_stable'||op==='change'||op==='frequency_change') {
                const count=['change','frequency_change'].includes(op)?2:n;const needed=this.config.window*count;
                if(this.history.length<needed) r=result('Inconclusive',`Stability needs ${needed} ticks (${count} non-overlapping windows); ${this.history.length} available.`,null);
                else {const all=this.history.slice(-needed).map(t=>t.digit);const values=Array.from({length:count},(_,i)=>frequency(all.slice(i*this.config.window,(i+1)*this.config.window),op==='parity_stable'?[0,2,4,6,8]:[d]));const change=values[values.length-1]-values[0];const spread=Math.max(...values)-Math.min(...values);r=op==='change'?number(change,`Frequency change ${change.toFixed(2)} percentage points.`):bool((op==='frequency_change'?Math.abs(change):spread)<=Number(f.TOLERANCE),`Windows ${values.map(v=>v.toFixed(2)+'%').join(' / ')}; spread ${spread.toFixed(2)}pp; tolerance ${f.TOLERANCE}pp.`);}
            } else if(op==='transition') {const sample=this.history.slice(-this.config.window);let hits=0,total=0;const cadence=this.config.group==='1-Second Volatility Indices'?1:2;for(let i=0;i<ds.length-1;i++)if(ds[i]===d&&sample[i+1].epoch-sample[i].epoch<=cadence){total++;if(ds[i+1]===Number(f.TO))hits++;}r=total<this.config.minSamples?result('Inconclusive',`${hits}/${total} observed transitions; requires ${this.config.minSamples} outgoing observations.`,null):number(hits/total*100,`${hits}/${total} observed transitions ${d} → ${f.TO}.`);}
            else if(minimum()) {
                const selected=op.startsWith('combined')?list():op.includes('even_frequency')?[0,2,4,6,8]:op==='odd_frequency'?[1,3,5,7,9]:op==='low_frequency'?[0,1,2,3,4]:op==='high_frequency'?[5,6,7,8,9]:[d];
                const pct=frequency(ds,selected);
                if(op==='occurrences') r=number(ds.filter(v=>v===d).length,`${ds.length} ticks sampled.`);
                else if(op==='frequency'||op==='combined'||op.endsWith('_frequency')) r=number(pct,`${selected.join(',')}: ${pct.toFixed(2)}% of ${ds.length} ticks.`);
                else if(op.startsWith('freq_')||op.startsWith('combined_')) r=bool(op.endsWith('at_or_below')?pct<=p:op.endsWith('at_or_above')?pct>=p:op.endsWith('below')?pct<p:pct>p,`Observed ${pct.toFixed(2)}%; threshold ${p}%; sample ${ds.length}.`);
            } else r=result('Inconclusive',`Only ${ds.length} ticks; requires ${this.config.minSamples}.`,null);
        }
        this.memo.set(id,r);this.log(node,r);return r;
    }
    private run(id?: string) {
        let node=id?this.graph.get(id):undefined;
        while(node && !this.endEvent && !['Stopped','Paused','Error'].includes(this.state)) {
            if(--this.budget<0){this.transition('Error','Evaluation exceeded 500 operations.');return;}
            const spec=SPEC.get(node.type)!;const op=spec.op;const f=node.fields;const n=Number(f.N);
            if(op.startsWith('pattern_detect_')) this.processPattern(node);
            else if(op==='adv_window') {this.config.window=n;this.config.minSamples=Math.min(this.config.minSamples,n);this.memo.clear();this.log(node,result('Pass',`Analysis window set to ${n} available genuine ticks.`));}
            else if(op==='research_windows'||op==='research_rank'||op==='research_explain') {if(op!=='research_explain'||!this.comparisons.length)this.comparisons=compareStrategies(this.history,this.config,Number(f.MINIMUM??10),op==='research_windows'?n:Math.floor(this.history.length/2));if(op==='research_rank')this.comparisons.sort((a,b)=>(b.score??-1)-(a.score??-1));this.log(node,result(this.comparisons.some(r=>r.score!==null)?'Pass':'Inconclusive',this.comparisons.map(r=>`${r.name}: ${r.passes}/${r.completed}. ${r.reason}`).join(' | ')));}
            else if(op==='pattern_reset') {this.patterns.reset();this.syncPatterns();this.log(node,result('Pass',this.patterns.reason));}
            else if(op==='pattern_allow_next') {this.patterns.allowNext();this.log(node,result('Pass',this.patterns.reason));}
            else if(op==='pattern_explain') this.log(node,result(this.patterns.pending.length?'Inconclusive':'Fail',this.patterns.reason));
            else if(op==='monitor_start'||op==='monitor_resume') {this.transition(this.ready&&this.connected?'Analysing':'Initialising','Monitoring armed. Genuine data readiness remains mandatory.');this.log(node,result('Pass',this.reason));}
            else if(op==='report_value') {const value=this.test(node.inputs.VALUE);this.log(node,value,spec.label);}
            else if(op==='next_genuine') {this.nextTicks.set(node.id,node.next);this.log(node,result('Pass','Connected continuation will run on the next genuine tick.'));return;}
            else if(op.startsWith('pattern_')) {const r=this.patterns.latest;this.log(node,result(r?.result??(r?.confirmation?'Pass':'Inconclusive'),`${spec.label}: ${this.patterns.reason}`));}
            else if(op==='if'||op==='if_else') {const r=this.test(node.inputs.CONDITION);if(r.status==='Pass')this.run(node.inputs.DO);else if(r.status==='Fail'&&op==='if_else')this.run(node.inputs.ELSE);}
            else if(op==='repeat') {for(let i=0;i<n&&!this.endEvent;i++)this.run(node.inputs.DO);}
            else if(op==='once') {if(!this.once.has(node.id)){this.once.add(node.id);this.run(node.inputs.DO);}}
            else if(op==='wait') {if(this.test(node.inputs.CONDITION).status==='Pass')this.run(node.inputs.DO);else this.waiters.set(node.id,node);}
            else if(op==='entry') this.entry(node);
            else if(op==='stop') this.stop();
            else if(op==='pause') this.pause();
            else if(op==='end') this.endEvent=true;
            else if(op==='reset') {this.passCount=0;this.failCount=0;this.variables.clear();this.counters.clear();this.lastCondition=false;}
            else if(op==='reset_counters') {this.passCount=0;this.failCount=0;this.counters.clear();}
            else if(op==='reset_streak') this.streakResetAt=this.tickIndex;
            else if(op==='cooldown_ticks') {this.cooldownUntilTick=this.tickIndex+n;if(this.patterns.records.length)this.patterns.startCooldown(n);this.log(node,result('Pass',`Restart after ${n} new genuine ticks.`));}
            else if(op==='cooldown_seconds') {this.cooldownUntilTime=this.now+n*1000;this.log(node,result('Pass',`Restart after ${n}s and a fresh tick.`));}
            else if(op==='restart') {this.lastCondition=false;this.log(node,result(this.pending.length?'Fail':'Pass',this.pending.length?'Restart blocked: previous evaluation pending.':'Restart armed for the next eligible tick.'));}
            else if(op==='note') {const message=String(f.TEXT);if(message!==this.lastNote){this.lastNote=message;this.log(node,result('Pass',message));}}
            else if(op==='set_variable') {const value=this.test(node.inputs.VALUE);if(value.status!=='Inconclusive')this.variables.set(String(f.NAME),Number(value.value));}
            else if(op==='increase') this.variables.set(String(f.NAME),(this.variables.get(String(f.NAME))??0)+n);
            else if(op==='reset_counter') this.variables.set(String(f.NAME),0);
            else if(op==='set_digit') {this.config.digit=Number(f.DIGIT);this.memo.clear();}
            else if(op==='suggest_digit') {if(this.digits.length>=this.config.minSamples){const ranking=ALL_DIGITS.slice().sort((a,b)=>(frequency(this.digits,[a])-frequency(this.digits,[b]))*(f.RANK==='highest-frequency'?-1:1)||a-b);this.config.digit=ranking[0];this.memo.clear();this.log(node,result('Pass',`Selected digit ${ranking[0]} by ${f.RANK}; not a prediction.`));}}
            else if(op==='set_barrier') {this.config.barrier=Number(f.BARRIER);this.memo.clear();}
            else if(op.startsWith('configure_')) this.config.strategy=op.replace('configure_','') as BotConfig['strategy'];
            else if(op.startsWith('observe')) {if(this.activeSetup){this.activeSetup.requiredTicks=op==='observe'?n:1;if(op!=='observe')this.activeSetup.config.strategy=op.replace('observe_','') as BotConfig['strategy'];this.log(node,result('Pass',`Waiting for ${this.activeSetup.requiredTicks} subsequent genuine tick(s).`));}}
            else if(op==='inconclusive') {if(this.activeSetup){this.activeSetup.status='Inconclusive';this.activeSetup.reason='Marked Inconclusive by the connected block.';}}
            else if(op==='stop_setups'&&this.journal.length>=n || op==='stop_evaluations'&&this.completed.length>=n || op==='stop_duration'&&this.now-this.startedAt>=n*1000 || op==='stale_stop'&&this.current&&this.now-this.current.epoch*1000>this.config.freshnessSeconds*1000 || op==='connection_stop'&&!this.connected) this.stop();
            else if(op==='use_market'||op==='continue') this.log(node,result('Pass',`Monitoring ${this.config.symbol}; public data only.`));
            node=node.next?this.graph.get(node.next):undefined;
        }
    }
    restorePatterns() { this.patterns.restore(this.journal.flatMap(o=>o.pattern?[o.pattern]:[]));this.sequence=Math.max(0,...this.trace.map(t=>t.id)); }
    private processPattern(node: Node) {
        if(!this.current)return;
        const program=compilePattern(node,this.config);
        const events=this.patterns.process(program,this.current,this.history.length,this.config.allowOverlap,this.config.maxSetups,this.now);
        for(const event of events){
            this.log(node,result(event.status,event.reason),event.label);
            if(event.label==='Setup detected'){this.transition('Setup Detected',event.reason);this.dispatch('setup');}
            if(event.label==='Observed outcome')this.dispatch('complete');
        }
        this.reason=this.patterns.reason;
        this.syncPatterns();
    }
    private syncPatterns() {
        for(const record of this.patterns.records) {
            let observation=this.journal.find(o=>o.id===record.id);
            if(!observation) {
                const {nodes:_,...snapshot}=this.config;
                observation={id:record.id,time:record.pair[record.pair.length-1]!.epoch*1000,tickKey:record.pair[record.pair.length-1]!.key,market:record.market,mode:this.mode,config:{...snapshot,strategy:record.program.strategy,digit:record.program.digit,barrier:record.program.barrier},frequencies:ALL_DIGITS.map(d=>frequency(this.digits,[d])),conditions:[],status:'Pending',reason:record.reason,subsequent:[],requiredTicks:1,pattern:record};
                this.journal.push(observation);
            }
            if(record.confirmation){observation.time=record.setupTime!;observation.tickKey=record.confirmation.key;}
            observation.reason=record.reason;observation.pattern=record;
            observation.subsequent=record.evaluation?[record.evaluation]:[];
            observation.status=record.result==='Pass'?'Qualified':record.result==='Fail'?'Not qualified':record.result==='Inconclusive'?'Inconclusive':'Pending';
        }
    }
    private entry(node: Node) {
        const r=this.test(node.inputs.CONDITION);
        if(r.status==='Pass'){this.passCount++;this.failCount=0;}else{this.passCount=0;this.failCount=r.status==='Fail'?this.failCount+1:0;}
        const previous=this.lastCondition;if(r.status!=='Pass')this.lastCondition=false;
        let blocked='';
        if(!this.current||!this.ready||!this.connected) blocked='Market data is not ready.';
        else if(this.now-this.current.epoch*1000>this.config.freshnessSeconds*1000) blocked='Market data is stale.';
        else if(this.digits.length<this.config.minSamples) blocked=`Only ${this.digits.length} ticks; requires ${this.config.minSamples}.`;
        else if(r.status!=='Pass') blocked=r.reason;
        else if(this.passCount<this.config.consecutivePasses) blocked=`${this.passCount}/${this.config.consecutivePasses} consecutive passing signals.`;
        else if(this.pending.length&&!this.config.allowOverlap) blocked='Restart blocked: previous evaluation is still pending.';
        else if(this.cooldown) blocked='Restart blocked: cooldown has not completed.';
        else if(this.journal.length>=this.config.maxSetups) blocked='Maximum setups per session reached.';
        else if(this.current.key===this.lastSignalKey || previous&&!this.config.repeated) blocked='Duplicate setup prevented; conditions must fail and pass again, or enable repeated signals.';
        else if((this.config.strategy==='over'&&this.config.barrier>8)||(this.config.strategy==='under'&&this.config.barrier<1)) blocked='Strategy barrier is invalid.';
        if(blocked){this.reason=blocked;this.log(node,result(r.status==='Inconclusive'?'Inconclusive':'Fail',blocked));return;}
        const {nodes:_,...snapshot}=this.config;
        const setup:Observation={id:`${this.config.id}:${this.current!.key}`,time:this.now,tickKey:this.current!.key,market:this.config.symbol,mode:this.mode,config:JSON.parse(JSON.stringify(snapshot)),frequencies:ALL_DIGITS.map(d=>frequency(this.digits,[d])),conditions:this.trace.filter(t=>t.id>this.evalTraceStart).map(t=>({...t})),status:'Pending',reason:r.reason,subsequent:[],requiredTicks:this.config.observeTicks};
        this.lastSignalKey=this.current!.key;this.lastCondition=true;this.journal.push(setup);this.activeSetup=setup;
        this.transition('Setup Detected','Hypothetical entry detected; no contract is purchased.');this.log(node,result('Pass',this.reason));
        this.run(node.inputs.DO);this.activeSetup=null;
        if(this.active)this.dispatch('setup');
    }
}
