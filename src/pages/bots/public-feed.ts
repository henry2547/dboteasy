import { DerivPublicWebSocketClient, type DerivMessage } from '../digits/deriv-public-ws';
import { filterDigitMarkets, normalizeActiveSymbols } from '../digits/markets';
import { formatQuote, extractLastDigit, resolvePrecision } from '../digits/precision';
import type { MarketSymbol } from '../digits/types';
import type { Tick } from './bot-model';
interface Callbacks { markets: (markets: MarketSymbol[])=>void; history: (ticks: Tick[])=>void; tick: (tick: Tick)=>void; status: (connected:boolean,ready:boolean,reason:string)=>void }
/** A session-owned public-only feed. Stop disconnects it; reconnect always reloads history. */
export class PublicBotFeed {
    private client: DerivPublicWebSocketClient;
    private market: MarketSymbol | null=null;
    private historyRequest=0;
    private subscription: string | null=null;
    private ready=false;
    private synchronising=false;
    resynchronise() {
        if(this.disposed||!this.market||this.synchronising)return;
        this.ready=false;
        if(this.subscription)this.client.send({forget:this.subscription});
        this.subscription=null;
        if(this.client.isOpen())this.load();
    }
    private precision: number | null=null;
    private status='idle';
    private off: (()=>void)[]=[];
    private disposed=false;
    private discoveryComplete=false;
    constructor(private callbacks: Callbacks) {
        this.client=new DerivPublicWebSocketClient();
        this.off.push(this.client.onStatus(s=>{
            if(s.status===this.status) return;this.status=s.status;
            if(this.disposed||this.discoveryComplete&&!this.market)return;
            this.ready=false;
            this.callbacks.status(s.status==='connected',false,s.status==='connected'?'Loading genuine history…':'Public feed '+s.status);
            this.synchronising=false;
            if(s.status==='connected') {if(this.market)this.load();else this.client.send({active_symbols:'full'});}
        }),this.client.onMessage(m=>this.message(m)));
    }
    discover() {this.client.connect();}
    watch(market: MarketSymbol) {
        if(this.market?.apiSymbol!==market.apiSymbol && this.subscription) this.client.send({forget:this.subscription});
        this.subscription=null;this.market=market;this.ready=false;this.precision=null;
        if(this.client.isOpen())this.load();else this.client.connect();
    }
    private load() {
        this.synchronising=true;this.ready=false;this.callbacks.status(true,false,'Resynchronising genuine history…');
        this.historyRequest=this.client.send({ticks_history:this.market!.apiSymbol,end:'latest',count:1000,style:'ticks',subscribe:1});
    }
    private message(m: DerivMessage) {
        const payload=m as Record<string,any>;
        if(this.disposed)return;
        if(payload.error){this.synchronising=false;this.ready=false;this.callbacks.status(false,false,String(payload.error.message??'Public data request failed.'));return;}
        if(m.msg_type==='active_symbols') {
            this.callbacks.markets(filterDigitMarkets(normalizeActiveSymbols(payload.active_symbols)).filter(m=>/volatility/i.test(m.displayName)&&m.isOpen&&!m.isSuspended));
            if(!this.market){this.discoveryComplete=true;this.client.disconnect();}return;
        }
        if(!this.market)return;
        if(m.msg_type==='history') {
            if(m.req_id!==this.historyRequest) {if(payload.subscription?.id)this.client.send({forget:payload.subscription.id});return;}
            this.subscription=payload.subscription?.id??this.subscription;
            this.precision=resolvePrecision({historyPipSize:payload.pip_size,livePipSize:null,activeSymbolPipSize:this.market.pipSize}).resolvedDecimalPlaces;
            if(this.precision===null){this.synchronising=false;this.callbacks.status(false,false,'Instrument precision is unavailable.');return;}
            const prices=payload.history?.prices,times=payload.history?.times;
            if(!Array.isArray(prices)||!Array.isArray(times)||prices.length!==times.length){this.synchronising=false;this.callbacks.status(false,false,'Malformed historical ticks.');return;}
            try {
                const ticks=prices.map((quote:unknown,i:number)=>this.normalize(quote,times[i]));
                if(ticks.some((t:Tick,i:number)=>i>0&&t.epoch<ticks[i-1].epoch))throw new Error('Historical ticks are not chronological.');
                this.synchronising=false;this.callbacks.history(ticks);this.ready=ticks.length>0;this.callbacks.status(true,this.ready,this.ready?'History loaded; observing public ticks.':'No genuine history is available.');
            } catch(e){this.ready=false;this.synchronising=false;this.callbacks.status(false,false,(e as Error).message);}
        }
        if(m.msg_type==='tick') {
            const tick=payload.tick;
            if(!this.ready||tick?.symbol!==this.market.apiSymbol)return;
            if(payload.subscription?.id) {if(this.subscription && this.subscription!==payload.subscription.id)return;this.subscription=payload.subscription.id;}
            if(tick.pip_size!==undefined && Number(tick.pip_size)!==this.precision){this.ready=false;this.callbacks.status(true,false,'Quote precision changed; resynchronising.');this.client.send({forget:this.subscription});this.subscription=null;this.load();return;}
            try{this.callbacks.tick(this.normalize(tick.quote,tick.epoch));}catch(e){this.ready=false;this.callbacks.status(false,false,(e as Error).message);this.resynchronise();}
        }
    }
    private normalize(quote:unknown,epoch:unknown): Tick {
        if((typeof quote!=='number'&&typeof quote!=='string')||String(quote).trim()===''||typeof epoch!=='number'||!Number.isFinite(Number(quote))||!Number.isFinite(epoch)||this.precision===null)throw new Error('Invalid price, timestamp, or precision.');
        const price=formatQuote(Number(quote),this.precision);const symbol=this.market!.apiSymbol;
        return {key:`${symbol}:${epoch}:${price}`,epoch:Number(epoch),digit:extractLastDigit(price),price,symbol};
    }
    stop() {
        this.disposed=true;
        if(this.subscription)this.client.send({forget:this.subscription});
        this.subscription=null;this.ready=false;this.off.forEach(f=>f());this.off=[];this.client.disconnect();
    }
}
