import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly/core';
import * as English from 'blockly/msg/en';
import { BLOCKS, CATEGORIES, SPEC } from './block-catalog';
import type { Node } from './bot-model';
export interface WorkspaceControls { undo:()=>void; redo:()=>void; clear:()=>void; deleteSelected:()=>void; highlight:(id:string)=>void; load:(nodes:Node[])=>void; read:()=>Node[] }
const colour = (index: number) => [210,180,195,225,265,290,155,35,45,145,25,0,170,320,300,205,250,175,40,285,155,15][index];
Blockly.setLocale(English);
BLOCKS.forEach(spec=>{
    Blockly.Blocks[spec.type]={init(this: Blockly.Block) {
        const header=this.appendDummyInput().appendField(spec.label);
        spec.fields.forEach(field=>{
            header.appendField(field.label);
            const control=field.kind==='number'?new Blockly.FieldNumber(Number(field.value),field.min,field.max,['PERCENT','TOLERANCE','VALUE','LOW','HIGH'].includes(field.name)?0:1):field.kind==='select'?new Blockly.FieldDropdown(field.choices!.map(v=>[v,v])):new Blockly.FieldTextInput(String(field.value));
            header.appendField(control,field.name);
        });
        Object.entries(spec.inputs).forEach(([name,type])=>this.appendValueInput(name).setCheck(type).appendField(name.toLowerCase()));
        if(spec.body)this.appendStatementInput('DO').appendField('do');
        if(spec.op==='if_else')this.appendStatementInput('ELSE').appendField('else');
        if(spec.output)this.setOutput(true,spec.output);else if(!spec.event){this.setPreviousStatement(true);this.setNextStatement(true);}
        this.setColour(colour(CATEGORIES.indexOf(spec.category)));
        this.setTooltip(spec.help);this.setInputsInline(false);
    }};
});
export default function BotWorkspace({initial,onChange,onReady,locked}:{initial:Node[];onChange:(nodes:Node[])=>void;onReady:(controls:WorkspaceControls)=>void;locked:boolean}) {
    const host=useRef<HTMLDivElement>(null);const workspace=useRef<Blockly.WorkspaceSvg|null>(null);const change=useRef(onChange);change.current=onChange;
    useEffect(()=>{
        if(!host.current)return;
        const ws=Blockly.inject(host.current,{toolbox:{kind:'categoryToolbox',contents:CATEGORIES.map((name,i)=>({kind:'category',name,colour:String(colour(i)),contents:BLOCKS.filter(b=>b.category===name).map(b=>({kind:'block',type:b.type}))}))},renderer:'zelos',trashcan:true,move:{scrollbars:true,drag:true,wheel:true},zoom:{controls:true,wheel:true,startScale:0.65,minScale:0.25,maxScale:1.5},grid:{spacing:24,length:2,colour:'#d4dce5',snap:true}});
        workspace.current=ws;let loading=false;
        const read=():Node[]=>ws.getAllBlocks(false).filter(b=>!b.isShadow()).map(b=>{
            const spec=SPEC.get(b.type)!;const xy=b.getRelativeToSurfaceXY();const inputs:Record<string,string>={};
            b.inputList.forEach(input=>{const target=input.connection?.targetBlock();if(target)inputs[input.name]=target.id;});
            const next=b.getNextBlock()?.id;
            return {id:b.id,type:b.type,fields:Object.fromEntries(spec.fields.map(f=>[f.name,f.kind==='number'?Number(b.getFieldValue(f.name)):String(b.getFieldValue(f.name))])),inputs,...(next?{next}:{}),x:xy.x,y:xy.y};
        });
        const load=(nodes:Node[])=>{
            loading=true;Blockly.Events.disable();
            try{
                ws.clear();const blocks=new Map<string,Blockly.BlockSvg>();
                for(const node of nodes){const b=ws.newBlock(node.type,node.id);Object.entries(node.fields).forEach(([name,value])=>b.setFieldValue(String(value),name));b.initSvg();blocks.set(node.id,b);}
                for(const node of nodes){const b=blocks.get(node.id)!;for(const [name,id] of Object.entries(node.inputs)){const child=blocks.get(id)!;const connection=b.getInput(name)?.connection;if(connection)connection.connect(child.outputConnection??child.previousConnection!);}if(node.next)b.nextConnection!.connect(blocks.get(node.next)!.previousConnection!);}
                blocks.forEach((b,id)=>{b.render();if(!b.getParent()){const node=nodes.find(n=>n.id===id)!;b.moveBy(node.x??30,node.y??30);}});
                // Examples are flattened records; lay out only roots, preserving connected graphs.
                let y=30;for(const b of ws.getTopBlocks(true)){const xy=b.getRelativeToSurfaceXY();b.moveBy(30-xy.x,y-xy.y);y+=b.getHeightWidth().height+60;}
                ws.clearUndo();Blockly.svgResize(ws);
            }finally{Blockly.Events.enable();loading=false;}
        };
        const listener=(event:Blockly.Events.Abstract)=>{if(!loading&&!event.isUiEvent)change.current(read());};
        ws.addChangeListener(listener);load(initial);
        onReady({read,load,undo:()=>ws.undo(false),redo:()=>ws.undo(true),clear:()=>{Blockly.Events.setGroup(true);try{ws.clear();}finally{Blockly.Events.setGroup(false);}change.current(read());},deleteSelected:()=>{const selected=Blockly.getSelected();if(selected instanceof Blockly.BlockSvg&&selected.workspace===ws)selected.dispose(true);},highlight:id=>{if(ws.getBlockById(id)){ws.highlightBlock(id);ws.centerOnBlock(id);}}});
        const resize=new ResizeObserver(()=>Blockly.svgResize(ws));resize.observe(host.current);
        return ()=>{resize.disconnect();ws.removeChangeListener(listener);ws.dispose();workspace.current=null;};
    },[]);
    useEffect(()=>{workspace.current?.getAllBlocks(false).forEach(b=>{b.setMovable(!locked);b.setEditable(!locked);b.setDeletable(!locked);});},[locked]);
    return <div className={'observer-workspace'+(locked?' observer-workspace--locked':'')}><div ref={host} className='observer-canvas' aria-label='Visual bot workspace'/>{locked&&<div className='observer-lock'>Stop the bot to edit blocks. Your running configuration is fixed.</div>}</div>;
}
