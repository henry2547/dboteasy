import { DerivPublicWebSocketClient } from '../digits/deriv-public-ws';
import { normalizeMarketSymbol } from '../digits/markets';
import { PublicBotFeed } from './public-feed';
jest.mock('../digits/deriv-public-ws',()=>{
    class Client {
        static instances: Client[]=[];
        status: (s:any)=>void=()=>{};message:(m:any)=>void=()=>{};packets:Record<string,unknown>[]=[];open=false;seq=0;
        constructor(){Client.instances.push(this);}
        onStatus(fn:(s:any)=>void){this.status=fn;return ()=>{this.status=()=>{};};}
        onMessage(fn:(m:any)=>void){this.message=fn;return ()=>{this.message=()=>{};};}
        connect(){this.open=true;this.status({status:'connected'});}
        disconnect(){this.open=false;this.status({status:'disconnected'});}
        isOpen(){return this.open;}
        send(packet:Record<string,unknown>){this.packets.push(packet);return ++this.seq;}
    }
    return {DerivPublicWebSocketClient:Client};
});
interface Client {status:(s:any)=>void;message:(m:any)=>void;packets:Record<string,unknown>[];seq:number}
const raw=(symbol='R_100',name='Volatility 100 Index',pip=0.01)=>({symbol,display_name:name,pip,exchange_is_open:1});
function setup(){
    const callbacks={markets:jest.fn(),history:jest.fn(),tick:jest.fn(),status:jest.fn()};const feed=new PublicBotFeed(callbacks);
    const client=(DerivPublicWebSocketClient as unknown as {instances:Client[]}).instances.slice(-1)[0];
    const market=normalizeMarketSymbol(raw())!;return {callbacks,feed,client,market};
}
describe('public bot feed safety',()=>{
    it('discovers only available Volatility families and does not overwrite discovery with disconnected status',()=>{const {feed,client,callbacks}=setup();feed.discover();client.message({msg_type:'active_symbols',active_symbols:[raw(),raw('1HZ10V','Volatility 10 (1s) Index'),raw('stpRNG','Step Index'),raw('JD10','Jump 10 Index'),{...raw('R_25','Volatility 25 Index'),is_trading_suspended:1}]});expect(callbacks.markets.mock.calls[0][0].map((m:any)=>m.apiSymbol)).toEqual(['R_100','1HZ10V']);expect(callbacks.status.mock.calls[callbacks.status.mock.calls.length-1]?.[2]).not.toBe('Public feed disconnected');feed.stop();});
    it('loads history first, preserves precision and discards live ticks before synchronisation',()=>{const {feed,client,callbacks,market}=setup();feed.watch(market);client.message({msg_type:'tick',tick:{symbol:'R_100',quote:123.4,epoch:10}});expect(callbacks.tick).not.toHaveBeenCalled();client.message({msg_type:'history',req_id:client.seq,pip_size:3,history:{prices:[123.4,123.407],times:[10,11]},subscription:{id:'one'}});expect(callbacks.history.mock.calls[0][0].map((t:any)=>[t.price,t.digit])).toEqual([['123.400',0],['123.407',7]]);client.message({msg_type:'tick',tick:{symbol:'R_100',quote:123.42,epoch:12,pip_size:3},subscription:{id:'one'}});expect(callbacks.tick.mock.calls[0][0]).toMatchObject({digit:0,price:'123.420'});expect(client.packets[0]).toMatchObject({ticks_history:'R_100',subscribe:1});expect(client.packets.some(p=>p.authorize||p.buy||p.proposal)).toBe(false);feed.stop();});
    it('rejects null prices, malformed history and nonchronological history instead of inventing data',()=>{const {feed,client,callbacks,market}=setup();feed.watch(market);client.message({msg_type:'history',req_id:client.seq,pip_size:2,history:{prices:[null],times:[10]}});expect(callbacks.history).not.toHaveBeenCalled();feed.resynchronise();client.message({msg_type:'history',req_id:client.seq,pip_size:2,history:{prices:[123.4,123.5],times:[11,10]}});expect(callbacks.history).not.toHaveBeenCalled();expect(callbacks.status.mock.calls.some(c=>String(c[2]).includes('not chronological'))).toBe(true);feed.stop();});
    it('forgets the subscription on resync/Stop and ignores old subscriptions and other instruments',()=>{const {feed,client,callbacks,market}=setup();feed.watch(market);client.message({msg_type:'history',req_id:client.seq,pip_size:2,history:{prices:[123.4],times:[10]},subscription:{id:'one'}});client.message({msg_type:'tick',tick:{symbol:'R_25',quote:123.4,epoch:11},subscription:{id:'one'}});client.message({msg_type:'tick',tick:{symbol:'R_100',quote:123.4,epoch:11},subscription:{id:'old'}});expect(callbacks.tick).not.toHaveBeenCalled();feed.resynchronise();expect(client.packets).toContainEqual({forget:'one'});client.message({msg_type:'history',req_id:client.seq,pip_size:2,history:{prices:[123.4],times:[12]},subscription:{id:'two'}});feed.stop();expect(client.packets).toContainEqual({forget:'two'});client.message({msg_type:'tick',tick:{symbol:'R_100',quote:123.4,epoch:13}});expect(callbacks.tick).not.toHaveBeenCalled();});
    it('reconnects by reloading genuine history before accepting new live ticks',()=>{const {feed,client,callbacks,market}=setup();feed.watch(market);client.message({msg_type:'history',req_id:client.seq,pip_size:2,history:{prices:[123.4],times:[10]},subscription:{id:'one'}});client.status({status:'disconnected'});client.status({status:'connected'});client.message({msg_type:'tick',tick:{symbol:'R_100',quote:123.5,epoch:12}});expect(callbacks.tick).not.toHaveBeenCalled();expect(client.packets.filter(p=>p.ticks_history)).toHaveLength(2);feed.stop();});
});
