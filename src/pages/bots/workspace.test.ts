import * as Blockly from 'blockly/core';
// Registers the same block definitions the real visual editor uses.
import './bot-workspace';
import { BLOCKS } from './block-catalog';
describe('Blockly observer graph',()=>{
    let ws:Blockly.Workspace;
    beforeEach(()=>{ws=new Blockly.Workspace();});afterEach(()=>ws.dispose());
    it.each(BLOCKS)('instantiates $type with the declared typed ports',spec=>{const b=ws.newBlock(spec.type);expect(b.type).toBe(spec.type);expect(b.outputConnection?.getCheck()??null).toEqual(spec.output?[spec.output]:null);Object.entries(spec.inputs).forEach(([name,type])=>expect(b.getInput(name)?.connection?.getCheck()).toEqual([type]));});
    it('rejects incompatible numeric and Boolean sockets',()=>{const and=ws.newBlock('obs_and');const number=ws.newBlock('obs_number');const condition=ws.newBlock('obs_even');expect(ws.connectionChecker.canConnect(and.getInput('A')!.connection!,number.outputConnection!,false)).toBe(false);expect(ws.connectionChecker.canConnect(and.getInput('A')!.connection!,condition.outputConnection!,false)).toBe(true);});
    it('round trips a connected graph without executing generated code',()=>{const start=ws.newBlock('obs_on_tick');const stop=ws.newBlock('obs_stop');start.getInput('DO')!.connection!.connect(stop.previousConnection!);const state=Blockly.serialization.workspaces.save(ws);const loaded=new Blockly.Workspace();Blockly.serialization.workspaces.load(state,loaded);expect(loaded.getAllBlocks(false)).toHaveLength(2);expect(loaded.getTopBlocks(false)[0].getInputTargetBlock('DO')?.type).toBe('obs_stop');loaded.dispose();});
    it('deletes a selected sequence and retains a valid serializable workspace',()=>{const block=ws.newBlock('obs_on_tick');const stop=ws.newBlock('obs_stop');block.getInput('DO')!.connection!.connect(stop.previousConnection!);block.dispose(false);expect(ws.getAllBlocks(false)).toEqual([]);expect(()=>Blockly.serialization.workspaces.save(ws)).not.toThrow();});
});
