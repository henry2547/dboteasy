import type { BotConfig, Observation, Trace } from './bot-model';
import { parseConfig } from './validation';
const KEY='dboteasy.observational-bots.v1';
export interface SavedBot { config: BotConfig; journal: Observation[]; trace: Trace[]; savedAt: number }
export function loadBots(): SavedBot[] {
    const raw=localStorage.getItem(KEY);if(!raw)return [];
    const data=JSON.parse(raw);
    if(!Array.isArray(data)||data.length>50)throw new Error('Saved bot library is malformed. Export or clear browser storage to recover it.');
    return data.map(row=>{
        if(!row||typeof row.savedAt!=='number'||!Array.isArray(row.journal)||row.journal.length>500||!Array.isArray(row.trace)||row.trace.length>500)throw new Error('Saved session is malformed.');
        return {...row,config:parseConfig(row.config)};
    });
}
export function saveBot(config: BotConfig, journal: Observation[], trace: Trace[]): SavedBot[] {
    const valid=parseConfig(config);const rows=loadBots();const record={config:valid,journal:journal.slice(-500),trace:trace.slice(-500),savedAt:Date.now()};
    const i=rows.findIndex(row=>row.config.id===config.id);if(i>=0)rows[i]=record;else {if(rows.length>=50)throw new Error('Library limit is 50 bots. Export a backup first.');rows.push(record);}
    localStorage.setItem(KEY,JSON.stringify(rows));return rows;
}
export function download(name: string, data: unknown, csv=false) {
    const blob=new Blob([csv?String(data):JSON.stringify(data,null,2)],{type:csv?'text/csv;charset=utf-8':'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function journalCSV(rows: Observation[]) {
    const quote=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
    return [['setup','timestamp','market','mode','strategy','selected digit','barrier','status','subsequent digits','reason','configuration version','pair','pair timestamps','confirmation digit','confirmation timestamp','intervening digits','setup timestamp','evaluation tick','condition','result','interruptions','lifecycle','deduplicated','configuration'],...rows.map(o=>{const p=o.pattern;return [o.id,new Date(o.time).toISOString(),o.market,o.mode,o.config.strategy,o.config.digit,o.config.barrier,o.status,o.subsequent.map(t=>t.digit).join(' '),o.reason,p?.program.version,p?.pair.map(t=>t.digit).join(' → '),p?.pair.map(t=>t.epoch).join(' → '),p?.confirmation?.digit,p?.confirmation?.epoch,p?.intervening.map(t=>t.digit).join(' → '),p?.setupTime,p?.evaluation?JSON.stringify(p.evaluation):'',p?.program?JSON.stringify(p.program):'',p?.result,p?.interruptions.join('; '),p?.lifecycle,p?.deduplicated,JSON.stringify(o.config)];})].map(row=>row.map(quote).join(',')).join('\r\n');
}
