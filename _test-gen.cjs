const Blockly = require('blockly');
const { javascriptGenerator } = require('blockly/javascript');

global.window = global.window || {};
global.window.Blockly = Blockly;
global.window.Blockly.JavaScript = { ...require('blockly/javascript'), ...(new Blockly.Generator('code')) };
global.window.Blockly.JavaScript.javascriptGenerator = javascriptGenerator;
global.window.Blockly.Colours = { Base: { colour: '#ccc', colourSecondary: '#aaa', colourTertiary: '#999' } };
global.window.Blockly.Categories = { Digits: 'Digits' };
global.window.Blockly.OUTPUT_SHAPE_HEXAGONAL = 1;
global.window.Blockly.OUTPUT_SHAPE_ROUND = 2;

// Mock modifyContextMenu
require('/app/src/external/bot-skeleton/scratch/blocks');

const { BLOCKS } = require('/app/src/external/bot-skeleton/scratch/blocks/Observer/observer-catalog');

const workspace = new Blockly.Workspace();
let failures = [];
let successes = 0;

BLOCKS.forEach(spec => {
  try {
    const block = workspace.newBlock(spec.type);
    if (spec.fields) spec.fields.forEach(f => { try { block.setFieldValue(String(f.value), f.name); } catch(e) {} });
    const handler = javascriptGenerator.forBlock[spec.type];
    if (typeof handler !== 'function') { failures.push({ type: spec.type, reason: 'NO forBlock handler' }); return; }
    handler.call(block, block, javascriptGenerator);
    successes++;
  } catch (e) { failures.push({ type: spec.type, reason: e.message }); }
});

console.log('Observer blocks — Successes:', successes, 'Failures:', failures.length);
failures.forEach(f => console.log(`  FAIL: ${f.type} — ${f.reason}`));

// Test Digits blocks
['digits_over_under','digits_even_odd','digits_matches_differs','digits_frequency','digits_frequency_count','digits_hot_cold','digits_streak'].forEach(t => {
  const h = javascriptGenerator.forBlock[t];
  console.log(`  ${t}: ${typeof h === 'function' ? 'OK' : 'MISSING'}`);
});

// Test workspaceToCode
workspace.clear();
try {
  const b = workspace.newBlock('obs_latest');
  const code = javascriptGenerator.workspaceToCode(workspace);
  console.log('workspaceToCode OK:', code.substring(0, 80));
} catch (e) { console.log('workspaceToCode FAIL:', e.message); }
