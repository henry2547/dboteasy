import { useEffect, useRef, useState } from 'react';
import type { MarketSymbol } from '../digits/types';
import type { BotConfig, Tick } from './bot-model';
import { BotEngine } from './engine';
import { PublicBotFeed } from './public-feed';
import { saveBot } from './persistence';
export function useBotSession() {
    const [markets,setMarkets]=useState<MarketSymbol[]>([]);const [status,setStatus]=useState('Discovering public Volatility markets…');
    const [revision,update]=useState(0);const [speed,setSpeed]=useState(5);const [replayPosition,setReplayPosition]=useState(0);
    const engine=useRef<BotEngine|null>(null);const feed=useRef<PublicBotFeed|null>(null);const replay=useRef<Tick[]>([]);const position=useRef(0);const timer=useRef<ReturnType<typeof setInterval>|null>(null);const lastPersist=useRef(0);
    const refresh=(persist=false)=>{update(r=>r+1);const e=engine.current;if(e&&(persist||e.journal.length&&Date.now()-lastPersist.current>3000)){try{saveBot(e.config,e.journal,e.trace);lastPersist.current=Date.now();}catch(error){setStatus('Session save failed: '+(error as Error).message);}}};
    const clearTimer=()=>{if(timer.current)clearInterval(timer.current);timer.current=null;};
    const stop=()=>{clearTimer();feed.current?.stop();feed.current=null;engine.current?.stop();refresh(true);setStatus('Stopped — public subscription and session timers cleaned up.');};
    const createFeed=()=>new PublicBotFeed({markets:setMarkets,history:ticks=>{
        const e=engine.current;if(!e)return;
        if(e.mode==='replay'){replay.current=ticks;position.current=0;setReplayPosition(0);e.seed([]);e.connection(true,true);feed.current?.stop();feed.current=null;setStatus(`Replay ready: ${ticks.length} genuine historical ticks. Step or Resume Replay.`);}
        else{e.seed(ticks);e.connection(true,true);}
        refresh();
    },tick:tick=>{const e=engine.current;if(e?.mode==='live'){e.step(tick,Date.now());if(!e.ready)feed.current?.resynchronise();if(e.state==='Stopped'){feed.current?.stop();feed.current=null;}refresh();}},status:(connected,ready,reason)=>{setStatus(reason);const e=engine.current;if(e?.mode==='live')e.connection(connected,ready);refresh();}});
    useEffect(()=>{
        const discovery=new PublicBotFeed({markets:m=>{setMarkets(m);setStatus(m.length?`${m.length} genuine Volatility markets discovered.`:'No permitted markets available.');},history:()=>{},tick:()=>{},status:(_c,_r,reason)=>setStatus(reason)});
        discovery.discover();
        const stale=setInterval(()=>{if(engine.current?.mode==='live'&&engine.current.active){engine.current.checkFreshness();if(!engine.current.ready)feed.current?.resynchronise();engine.current.patterns.advanceStage(Date.now());refresh();}},1000);
        return ()=>{discovery.stop();clearInterval(stale);clearTimer();feed.current?.stop();engine.current?.stop();};
    },[]);
    const start=(config:BotConfig,mode:'live'|'replay')=>{
        clearTimer();feed.current?.stop();
        const old=engine.current;old?.stop();if(old?.pending.length)old.pending.forEach(o=>{o.status='Inconclusive';o.reason='Reconfiguration/resynchronisation interrupted the preserved evaluation.';});
        const e=new BotEngine(config,mode);if(old?.config.id===config.id){e.journal=old.journal;e.trace=old.trace;e.restorePatterns();}
        engine.current=e;e.start();if(e.state==='Error'){refresh();return;}
        const market=markets.find(m=>m.apiSymbol===config.symbol);if(!market){setStatus('Selected market is unavailable.');e.stop();refresh();return;}
        replay.current=[];position.current=0;feed.current=createFeed();feed.current.watch(market);refresh();
    };
    const step=()=>{const e=engine.current;if(!e||e.mode!=='replay')return;
        if(position.current>=replay.current.length){e.finish();clearTimer();refresh(true);return;}
        if(e.state==='Paused')e.resume();const tick=replay.current[position.current++];e.step(tick,tick.epoch*1000);setReplayPosition(position.current);
        if(position.current>=replay.current.length){e.finish();clearTimer();}
        refresh();
    };
    const resumeReplay=()=>{clearTimer();if(engine.current?.state==='Paused')engine.current.resume();timer.current=setInterval(step,1000/speed);refresh();};
    useEffect(()=>{if(timer.current)resumeReplay();},[speed]);
    return {markets,status,revision,engine:engine.current,speed,setSpeed,replayPosition,replayCount:replay.current.length,start,stop,
        pause:()=>{clearTimer();engine.current?.pause();refresh(true);},resume:()=>{engine.current?.resume();feed.current?.resynchronise();refresh();},step,resumeReplay,
        reset:()=>{clearTimer();feed.current?.stop();feed.current=null;engine.current?.reset();position.current=0;setReplayPosition(0);refresh(true);},
        loadSession:(config:BotConfig,journal:BotEngine['journal'],trace:BotEngine['trace'])=>{clearTimer();feed.current?.stop();feed.current=null;const e=new BotEngine(config);e.journal=JSON.parse(JSON.stringify(journal));e.trace=JSON.parse(JSON.stringify(trace));e.journal.filter(o=>o.status==='Pending').forEach(o=>{o.status='Inconclusive';o.reason='Saved pending evaluation cannot be resumed across a reload.';});e.restorePatterns();e.patterns.interrupt('Reloaded session: incomplete sequences cannot cross a reload.');engine.current=e;refresh();},
    };
}
