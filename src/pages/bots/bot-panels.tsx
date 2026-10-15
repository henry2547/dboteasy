import type { BotConfig } from './bot-model';
import { STATES, STRATEGIES, WINDOWS } from './bot-model';
import type { BotEngine } from './engine';
import type { MarketSymbol } from '../digits/types';
import type { Issue } from './validation';
export function Configuration({config,markets,disabled,onChange}:{config:BotConfig;markets:MarketSymbol[];disabled:boolean;onChange:(next:BotConfig)=>void}) {
    const set=(key:keyof BotConfig,value:unknown)=>onChange({...config,[key]:value});
    const number=(key:keyof BotConfig,label:string,min:number,max:number)=><label key={key}>{label}<input type='number' min={min} max={max} value={config[key] as number} onChange={e=>set(key,Number(e.target.value))}/></label>;
    return <fieldset disabled={disabled} className='observer-settings'><legend>1. Configure your observer</legend>
        <label>Bot name<input value={config.name} maxLength={100} onChange={e=>set('name',e.target.value)}/></label>
        <label>Description<input value={config.description} maxLength={2000} onChange={e=>set('description',e.target.value)}/></label>
        <label>Market group<select value={config.group} onChange={e=>onChange({...config,group:e.target.value as BotConfig['group'],symbol:''})}><option>Volatility Indices</option><option>1-Second Volatility Indices</option></select></label>
        <label>Market<select value={config.symbol} onChange={e=>set('symbol',e.target.value)}><option value=''>Select a discovered market</option>{markets.filter(m=>m.category===config.group).map(m=><option key={m.apiSymbol} value={m.apiSymbol}>{m.displayName}</option>)}</select></label>
        <label>Default strategy (pattern blocks override)<select value={config.strategy} onChange={e=>set('strategy',e.target.value)}>{STRATEGIES.map(s=><option key={s}>{s}</option>)}</select></label>
        {number('digit','Selected match / excluded digit',0,9)}{number('barrier','Default barrier (pattern blocks override)',0,9)}
        <label>Rolling analysis window<select value={config.window} onChange={e=>set('window',Number(e.target.value))}>{(WINDOWS.includes(config.window)?WINDOWS:[...WINDOWS,config.window].sort((a,b)=>a-b)).map(w=><option key={w}>{w}</option>)}</select></label>
        {number('minSamples','Minimum genuine ticks',1,1000)}{number('consecutivePasses','Required consecutive passing ticks',1,1000)}
        {number('cooldownTicks','Cooldown ticks after evaluation',0,1000)}{number('cooldownSeconds','Cooldown seconds after evaluation',0,86400)}
        {number('maxSetups','Maximum setups per session',1,500)}{number('freshnessSeconds','Maximum tick age (seconds)',3,120)}
        <label>On Stop, pending evaluations<select value={config.pendingOnStop} onChange={e=>set('pendingOnStop',e.target.value)}><option value='invalidate'>Mark Inconclusive</option><option value='cancel'>Cancel</option><option value='preserve'>Preserve snapshot (no offline outcomes)</option></select></label>
        <label className='observer-check'><input type='checkbox' checked={config.repeated} onChange={e=>set('repeated',e.target.checked)}/>Allow repeated signals while conditions stay true</label>
        <label className='observer-check'><input type='checkbox' checked={config.allowOverlap} onChange={e=>set('allowOverlap',e.target.checked)}/>Allow overlapping observations</label>
    </fieldset>;
}
export function ValidationPanel({issues,highlight}:{issues:Issue[];highlight:(id:string)=>void}) {
    return <section className='observer-panel' aria-label='Validation panel'><h3>Validation</h3>{!issues.length?<p className='observer-pass'>Configuration is valid. Start performs public-data observation only.</p>:<ul>{issues.map((i,k)=><li key={k} className={'observer-'+i.severity}><button onClick={()=>i.blockId&&highlight(i.blockId)}>{i.severity==='error'?'Error':'Suggestion'}: {i.message}</button></li>)}</ul>}</section>;
}
export function SessionPanels({engine,highlight}:{engine:BotEngine|null;highlight:(id:string)=>void}) {
    return <>
        <section className='observer-panel' aria-label='Live condition inspector'><h3>Live condition inspector</h3><p role='status'>{engine?.reason??'Choose a market, validate your blocks, then start.'}</p>
            <div className='observer-metrics'><span>Market <b>{engine?.config.symbol||'—'}</b></span><span>Strategy <b>{engine?.config.strategy||'—'}</b></span><span>Latest digit <b>{engine?.current?.digit??'—'}</b></span><span>Last genuine tick <b>{engine?.current?new Date(engine.current.epoch*1000).toLocaleTimeString():'—'}</b></span><span>Setups <b data-testid='setup-count'>{engine?.journal.length??0}</b></span><span>Pending <b>{engine?.pending.length??0}</b></span><span>Completed <b>{engine?.completed.length??0}</b></span><span>Genuine ticks available <b>{engine?.history.length??0}</b></span></div>
            <div className='observer-states' aria-label='Bot state machine'>{STATES.map(s=><span key={s} aria-current={engine?.state===s?'step':undefined}>{s}</span>)}</div>
        </section>
        <section className='observer-panel'><h3>Execution trace · latest 500 events</h3><p>Click a condition to highlight its block. Percentages and exact thresholds appear in each explanation.</p><div className='observer-log' aria-label='Execution trace'>{engine?.trace.slice(-80).reverse().map(t=><button className={'observer-trace observer-'+t.status.toLowerCase()} key={t.id+'-'+t.time} onClick={()=>highlight(t.blockId)}><time>{new Date(t.time).toLocaleTimeString()}</time><strong>{t.status} · {t.label}</strong><span>{t.market} · digit {t.digit??'—'} · {t.state}</span><span>{t.reason}{t.value!==null&&typeof t.value!=='boolean'?` [${JSON.stringify(t.value)}]`:''}</span></button>)??<p>No evaluations yet.</p>}</div></section>
        <section className='observer-panel'><h3>Signal & outcome journal · observational only</h3><p>Setup snapshots never change after detection. Only subsequent genuine ticks determine an outcome.</p><div className='observer-log' aria-label='Observation journal'>{engine?.journal.slice().reverse().map(o=><details className='observer-observation' key={o.id}><summary>{new Date(o.time).toLocaleTimeString()} · {o.config.strategy} · {o.status} · {o.market}</summary><p>{o.reason}</p><p>Subsequent digits: {o.subsequent.map(t=>t.digit).join(', ')||'waiting'} · required: {o.requiredTicks}</p><pre>{JSON.stringify({setup:o.id,mode:o.mode,configuration:o.config,frequencies:o.frequencies,conditions:o.conditions},null,2)}</pre></details>)}</div></section>
    </>;
}
