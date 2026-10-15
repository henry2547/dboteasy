import type { BotConfig } from './bot-model';
import type { BotEngine } from './engine';
import { PATTERN_STAGES, compilePattern, isDetector } from './pattern-program';
const time = (epoch: number | null | undefined) => epoch == null ? '—' : new Date(epoch * 1000).toLocaleString();
export function PatternStagePanel({engine,config}:{engine:BotEngine|null;config:BotConfig}) {
    const detector = config.nodes.find(isDetector);
    if (!detector) return null;
    const runtime = engine?.patterns;
    const program = compilePattern(detector, config);
    const record = runtime?.latest?.market===config.symbol && runtime.latest.program.version===program.version ? runtime.latest : null;
    const stage = runtime?.stage ?? 'Waiting for pair';
    const fields: [string,string|number][] = [
        ['Selected market', config.symbol || 'Select a Volatility market'], ['Active pattern', program.name],
        ['Current stage', stage], ['Detected pair', record?.pair.map(t=>t.digit).join(' → ') || '—'],
        ['Pair start timestamp', time(record?.pair[0]?.epoch)], ['Confirmation digit required', program.confirmation],
        ['Confirmation timestamp', time(record?.confirmation?.epoch)], ['Number of intervening ticks', record?.intervening.length ?? 0],
        ['Setup identifier', record?.confirmation ? record.id : 'Not confirmed'],
        ['Next tick awaiting evaluation', record?.confirmation && !record.evaluation && record.lifecycle==='pending' ? 'Yes — confirmation is not the outcome' : 'No'],
        ['Latest observed digit', engine?.current?.digit ?? '—'], ['Observational outcome', record?.result ?? 'Pending'],
        ['Current cooldown', `${runtime?.cooldown ?? 0} ticks / ${runtime?.cooldownSeconds ?? 0}s`], ['Data connection status', engine ? engine.connected && engine.ready ? engine.mode==='replay'?'Genuine historical replay':'Connected · synchronised' : 'Interrupted / synchronising' : 'Not monitoring'],
    ];
    return <section className='observer-panel observer-stage-panel' aria-label='Visual pattern stage panel'>
        <h2>Pattern stage · <span data-testid='pattern-stage' aria-live='polite'>{stage}</span></h2>
        <div className='observer-states'>{PATTERN_STAGES.map(s=><span key={s} aria-current={stage===s?'step':undefined}>{s}</span>)}</div>
        <div className='observer-metrics'>{fields.map(([label,value])=><span key={label}>{label}<b>{value}</b></span>)}</div>
        <p role='status'><strong>Explanation of the latest state change: </strong>{runtime?.reason ?? 'Start monitoring or replay genuine history to begin. No simulated ticks are used.'}</p>
        <p>Configuration version: {program.version} · Confirmation timeout: {program.timeout || 'unlimited'} · Intervening digits: {program.intervening?'allowed':'not allowed'}</p>
    </section>;
}
export function PatternResults({engine}:{engine:BotEngine|null}) {
    const records=engine?.patterns.records??[];
    return <section className='observer-panel' aria-label='Pattern results'><h2>Pattern results</h2><p>Each row is one adjacent run, including incomplete or invalidated attempts. Setup and subsequent outcome are separate.</p>
        <div className='observer-table-wrap'><table><thead><tr><th>Market / version</th><th>Run / timestamps</th><th>Confirmation / delay</th><th>Next genuine tick</th><th>Condition / result</th><th>Explanation / lifecycle</th></tr></thead><tbody>
            {!records.length&&<tr><td colSpan={6}>No pattern instances yet. Every decision will appear here and in the execution trace.</td></tr>}
            {records.slice().reverse().map(r=><tr key={r.id}><td>{r.market}<br/>{r.program.name}<br/><small>{r.program.version}</small></td><td>{r.pair.map(t=>t.digit).join(' → ')}<br/>{time(r.pair[0]?.epoch)}<br/>{time(r.pair[r.pair.length-1]?.epoch)}</td><td>{r.confirmation?`${r.confirmation.digit} · ${time(r.confirmation.epoch)}`:`Waiting for ${r.program.confirmation}`}<br/>{r.intervening.length} intervening ticks<br/><small>{r.intervening.map(t=>t.digit).join(' → ')}</small></td><td>{r.evaluation?`${r.evaluation.digit} · ${r.evaluation.price}`:'Not evaluated'}<br/>{time(r.evaluation?.epoch)}</td><td>{r.program.strategy} {['over','under'].includes(r.program.strategy)?r.program.barrier:['matches','differs'].includes(r.program.strategy)?r.program.digit:''}<br/><strong className={'observer-'+(r.result??'inconclusive').toLowerCase()}>{r.result??'Pending'}</strong></td><td>{r.reason}<br/><b>{r.lifecycle}</b><details><summary>Full execution record</summary><pre>{JSON.stringify(r,null,2)}</pre></details></td></tr>)}
        </tbody></table></div>
    </section>;
}
export function StrategyComparisons({engine}:{engine:BotEngine|null}) {
    const rows=engine?.comparisons??[];
    return <section className='observer-panel' aria-label='Strategy comparison results'><h2>Observed strategy comparison</h2><p>Connect a comparison block to a lifecycle event or condition. Ranking requires sufficient completed observations in both disjoint windows and acceptable variation. No profitability claim.</p>
        {!rows.length?<p>No comparison executed yet.</p>:<div className='observer-table-wrap'><table><thead><tr><th>Strategy</th><th>Setups / completed</th><th>Observed pass frequency</th><th>Mean confirmation delay</th><th>Window samples / variation</th><th>Rank eligibility</th></tr></thead><tbody>{rows.map(r=><tr key={r.strategy}><td>{r.name}</td><td>{r.setups} / {r.completed}</td><td>{r.frequency===null?'Inconclusive':`${r.frequency.toFixed(2)}% (${r.passes}/${r.completed})`}</td><td>{r.meanDelay?.toFixed(2)??'—'} ticks</td><td>{r.windows.map(w=>`${w.completed} outcomes: ${w.frequency?.toFixed(2)??'—'}%`).join(' / ')}<br/>{r.stability?.toFixed(2)??'—'}pp variation</td><td>{r.reason}{r.score!==null&&<><br/>95% lower bound: {(r.score*100).toFixed(2)}%</>}</td></tr>)}</tbody></table></div>}
    </section>;
}
